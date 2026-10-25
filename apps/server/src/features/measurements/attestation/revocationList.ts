import { attestationRevocations } from "@openbts/drizzle";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import db from "../../../database/psql.js";
import { chunks } from "../../../lib/collections.js";
import { fetchCapped } from "../../../lib/fetchCapped.js";
import { logger } from "../../../utils/logger.js";
import { serialBytes } from "./verify.js";

const STATUS_LIST_URL = "https://android.googleapis.com/attestation/status";
const STATUS_LIST_MAX_BYTES = 4 * 1024 * 1024;
const ROWS_PER_STATEMENT = 5_000;

const statusListSchema = z.object({
  entries: z.record(z.string().regex(/^[0-9a-f]+$/), z.object({ status: z.enum(["REVOKED", "SUSPENDED"]), reason: z.string().max(64).optional() })),
});

export async function refreshAttestationRevocations(): Promise<void> {
  const body = await fetchCapped(STATUS_LIST_URL, STATUS_LIST_MAX_BYTES);
  const { entries } = statusListSchema.parse(JSON.parse(body.toString("utf8")));
  const rows = Object.entries(entries).map(([serial, entry]) => ({
    serial: serialBytes(serial),
    status: entry.status === "REVOKED" ? ("revoked" as const) : ("suspended" as const),
    reason: entry.reason ?? null,
  }));
  if (rows.length === 0) throw new Error("Google's attestation status list came back empty");

  const listed = new Set(rows.map((row) => row.serial.toString("hex")));
  await db.transaction(async (tx) => {
    const stored = await tx.select({ serial: attestationRevocations.serial }).from(attestationRevocations);
    await Promise.all(
      chunks(rows, ROWS_PER_STATEMENT).map((chunk) =>
        tx
          .insert(attestationRevocations)
          .values(chunk)
          .onConflictDoUpdate({ target: attestationRevocations.serial, set: { status: sql`excluded.status`, reason: sql`excluded.reason` } }),
      ),
    );
    const unlisted = stored.map((row) => row.serial).filter((serial) => !listed.has(serial.toString("hex")));
    await Promise.all(
      chunks(unlisted, ROWS_PER_STATEMENT).map((chunk) => tx.delete(attestationRevocations).where(inArray(attestationRevocations.serial, chunk))),
    );
  });
  logger.info("attestation_revocations.refreshed", { entries: rows.length });
}

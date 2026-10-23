import { attestationRevocations } from "@openbts/drizzle";
import { notInArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import db from "../../../database/psql.js";
import { fetchCapped } from "../../../lib/fetchCapped.js";
import { logger } from "../../../utils/logger.js";
import { serialBytes } from "./verify.js";

const STATUS_LIST_URL = "https://android.googleapis.com/attestation/status";
const STATUS_LIST_MAX_BYTES = 4 * 1024 * 1024;

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

  await db.transaction(async (tx) => {
    await tx
      .insert(attestationRevocations)
      .values(rows)
      .onConflictDoUpdate({ target: attestationRevocations.serial, set: { status: sql`excluded.status`, reason: sql`excluded.reason` } });
    await tx.delete(attestationRevocations).where(
      notInArray(
        attestationRevocations.serial,
        rows.map((row) => row.serial),
      ),
    );
  });
  logger.info("attestation_revocations.refreshed", { entries: rows.length });
}

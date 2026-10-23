import { bootKeyLists, knownBootKeys } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import db from "../../../database/psql.js";
import { fetchCapped } from "../../../lib/fetchCapped.js";
import { logger } from "../../../utils/logger.js";
import { verifySshSignature } from "./sshSignature.js";
import { BOOT_KEY_LISTS, type BootKeyList } from "./trustedKeys.js";

const LIST_MAX_BYTES = 256 * 1024;
const SIGNATURE_MAX_BYTES = 4 * 1024;

const bootKeyListSchema = z.object({
  verifiedBootKeys: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1),
  timestamp: z.number().int().positive(),
});

export async function refreshBootKeyList(source: BootKeyList): Promise<void> {
  const [list, signature] = await Promise.all([fetchCapped(source.listUrl, LIST_MAX_BYTES), fetchCapped(source.signatureUrl, SIGNATURE_MAX_BYTES)]);
  if (!verifySshSignature(list, signature.toString("utf8"), Buffer.from(source.signerKey, "base64"), source.namespace)) {
    throw new Error(`The ${source.os} boot key list is not signed with its pinned key`);
  }
  const { verifiedBootKeys, timestamp } = bootKeyListSchema.parse(JSON.parse(list.toString("utf8")));

  await db.transaction(async (tx) => {
    const [stored] = await tx
      .select({ listTimestamp: bootKeyLists.listTimestamp })
      .from(bootKeyLists)
      .where(eq(bootKeyLists.os, source.os))
      .for("update");
    if (stored && timestamp < stored.listTimestamp) {
      throw new Error(`The ${source.os} boot key list went back from timestamp ${stored.listTimestamp} to ${timestamp}`);
    }

    const fetchedAt = new Date();
    await tx
      .insert(knownBootKeys)
      .values(verifiedBootKeys.map((key) => ({ verifiedBootKey: Buffer.from(key, "hex"), os: source.os })))
      .onConflictDoNothing();
    await tx
      .insert(bootKeyLists)
      .values({ os: source.os, listTimestamp: timestamp, fetchedAt })
      .onConflictDoUpdate({ target: bootKeyLists.os, set: { listTimestamp: timestamp, fetchedAt } });
  });
  logger.info("known_boot_keys.refreshed", { os: source.os, keys: verifiedBootKeys.length, timestamp });
}

export async function refreshBootKeyLists(): Promise<void> {
  const results = await Promise.allSettled(BOOT_KEY_LISTS.map(refreshBootKeyList));
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (failures.length > 0) throw new AggregateError(failures, `${failures.length} of ${BOOT_KEY_LISTS.length} boot key lists were not refreshed`);
}

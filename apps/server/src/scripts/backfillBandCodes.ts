import { bands } from "@openbts/drizzle";
import { db, sql } from "@openbts/drizzle/db";
import { resolveCatalogBand } from "@openbts/shared/bandCatalog";
import { asc, eq } from "drizzle-orm";

import { runAuditedOperation, systemAuditContext } from "../features/audit/index.js";
import type { BandRow } from "../features/bands/serialize.js";

const APPLY = process.argv.includes("--apply");

function proposeCodes(rows: BandRow[]): Map<number, string> {
  const taken = new Set(rows.flatMap((row) => (row.code === null ? [] : [`${row.code}:${row.variant}`])));
  const proposals = new Map<number, string>();

  for (const row of rows) {
    const label = `#${row.id} ${row.name} (${row.rat} ${row.value ?? "-"} ${row.duplex ?? "-"} ${row.variant})`;
    if (row.code !== null) {
      console.log(`${label}: already ${row.code}`);
      continue;
    }

    const catalog = resolveCatalogBand(row);
    const sameDuplex = catalog !== null && (catalog.rat === "GSM" ? row.duplex === null : catalog.duplex === row.duplex);
    if (catalog === null || !sameDuplex) {
      console.log(`${label}: left without a code`);
      continue;
    }

    const key = `${catalog.code}:${row.variant}`;
    if (taken.has(key)) {
      console.log(`${label}: ${catalog.code} is already taken, left without a code`);
      continue;
    }

    taken.add(key);
    proposals.set(row.id, catalog.code);
    console.log(`${label}: ${catalog.code}`);
  }
  return proposals;
}

async function main() {
  const rows = await db.select().from(bands).orderBy(asc(bands.id));
  const proposals = proposeCodes(rows);

  if (!APPLY) {
    console.log(`would set ${proposals.size} codes; run again with --apply to write them`);
    return;
  }
  if (proposals.size === 0) return;

  await runAuditedOperation(systemAuditContext(), { kind: "band.update" }, async (tx, audit) => {
    for (const row of rows) {
      const code = proposals.get(row.id);
      if (code === undefined) continue;

      /* eslint-disable-next-line no-await-in-loop */
      const [updated] = await tx.update(bands).set({ code }).where(eq(bands.id, row.id)).returning();
      /* eslint-disable-next-line no-await-in-loop */
      await audit.log({ entity: "bands", op: "update", recordId: row.id, old: row, new: updated });
    }
  });
  console.log(`set ${proposals.size} codes`);
}

main()
  .catch((error: unknown) => {
    console.error("backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
    process.exit();
  });

// oxlint-disable no-await-in-loop
import { auditOperations } from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { asc, gt, inArray } from "drizzle-orm";

import { loadOperationCountries } from "../features/audit/country.js";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 500;
const NO_COUNTRY = "none";

async function main() {
  const totals = new Map<string, number>();
  let changed = 0;
  let lastId = 0;

  while (true) {
    const rows = await db
      .select({ id: auditOperations.id, countryCode: auditOperations.country_code })
      .from(auditOperations)
      .where(gt(auditOperations.id, lastId))
      .orderBy(asc(auditOperations.id))
      .limit(BATCH_SIZE);
    const last = rows.at(-1);
    if (last === undefined) break;
    lastId = last.id;

    const countries = await loadOperationCountries(
      db,
      rows.map((row) => row.id),
    );
    for (const [countryCode, operations] of Map.groupBy(rows, (row) => countries.get(row.id) ?? null)) {
      const label = countryCode ?? NO_COUNTRY;
      totals.set(label, (totals.get(label) ?? 0) + operations.length);

      const staleIds = operations.filter((operation) => operation.countryCode !== countryCode).map((operation) => operation.id);
      changed += staleIds.length;
      if (!APPLY || staleIds.length === 0) continue;

      await db.update(auditOperations).set({ country_code: countryCode }).where(inArray(auditOperations.id, staleIds));
    }
  }

  for (const [countryCode, count] of [...totals].sort(([a], [b]) => a.localeCompare(b))) console.log(`${countryCode}: ${count} operations`);
  console.log(APPLY ? `updated ${changed} operations` : `would update ${changed} operations; run again with --apply to write them`);
}

main()
  .catch((error: unknown) => {
    console.error("stamping failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });

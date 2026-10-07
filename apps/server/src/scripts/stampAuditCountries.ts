// oxlint-disable no-await-in-loop
import { auditOperations } from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { asc, gt, sql } from "drizzle-orm";

import { loadOperationCountries } from "../features/audit/country.js";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 5000;
const NO_COUNTRY = "none";

async function main(): Promise<void> {
  const totals = new Map<string, number>();
  let changed = 0;
  let processed = 0;
  let lastId = 0;

  console.log(APPLY ? "applying country stamps" : "dry run, pass --apply to write country stamps");

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
    const updates: { id: number; countryCode: string | null }[] = [];
    for (const row of rows) {
      const countryCode = countries.get(row.id) ?? null;
      const label = countryCode ?? NO_COUNTRY;
      totals.set(label, (totals.get(label) ?? 0) + 1);
      if (row.countryCode !== countryCode) updates.push({ id: row.id, countryCode });
    }

    if (APPLY && updates.length > 0) {
      const values = sql.join(
        updates.map(({ id, countryCode }) => sql`(${id}::integer, ${countryCode}::text)`),
        sql`, `,
      );
      await db
        .update(auditOperations)
        .set({ country_code: sql`country_stamps.country_code` })
        .from(sql`(VALUES ${values}) AS country_stamps(id, country_code)`)
        .where(sql`${auditOperations.id} = country_stamps.id`);
    }
    changed += updates.length;
    processed += rows.length;
    console.log(`processed ${processed} operations (through #${lastId}) ${changed} ${APPLY ? "updated" : "would change"}`);
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

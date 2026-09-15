import { sql } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import type { SequenceTable } from "./types.js";

const TABLE_SQL: Record<SequenceTable, ReturnType<typeof sql.raw>> = {
  cells: sql.raw('"cells"'),
  locations: sql.raw('"locations"'),
  station_sectors: sql.raw('"station_sectors"'),
  extra_identificators: sql.raw('"extra_identificators"'),
  operators: sql.raw('"operators"'),
  bands: sql.raw('"bands"'),
  regions: sql.raw('"regions"'),
};

export async function bumpIdentitySequences(tx: DbTx, tables: ReadonlySet<SequenceTable>): Promise<void> {
  // eslint-disable-next-line no-await-in-loop
  for (const tableName of tables) await bumpIdentitySequence(tx, tableName);
}

export async function bumpIdentitySequence(tx: DbTx, tableName: SequenceTable, minimumValue = 1): Promise<void> {
  const table = TABLE_SQL[tableName];
  await tx.execute(sql`
    SELECT setval(
      pg_get_serial_sequence(${tableName}, 'id'),
      GREATEST(
        COALESCE((SELECT MAX(id) FROM ${table}), 1),
        COALESCE((
          SELECT last_value
          FROM pg_sequences
          WHERE format('%I.%I', schemaname, sequencename)::regclass = pg_get_serial_sequence(${tableName}, 'id')::regclass
        ), 1),
        ${minimumValue},
        1
      ),
      true
    )
  `);
}

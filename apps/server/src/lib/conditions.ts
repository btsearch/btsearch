import { type AnyColumn, type SQL, eq, sql } from "drizzle-orm";

export function flagCondition(flag: AnyColumn, isSet: boolean): SQL {
  return isSet ? eq(flag, true) : sql`${flag} IS NOT TRUE`;
}

export function idsIn(ids: readonly number[]): SQL {
  return sql`(SELECT wanted.id::integer FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) AS wanted (id))`;
}

import { type AnyColumn, type SQL, eq, sql } from "drizzle-orm";

export function flagCondition(flag: AnyColumn, isSet: boolean): SQL {
  return isSet ? eq(flag, true) : sql`${flag} IS NOT TRUE`;
}

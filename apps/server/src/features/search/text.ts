import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function containsPattern(value: string): string {
  return `%${escapeLike(value)}%`;
}

export function foldText(value: SQLWrapper | string): SQL {
  return sql`fold_text(${value})`;
}

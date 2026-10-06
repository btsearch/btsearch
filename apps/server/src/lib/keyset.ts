import { idSchema } from "@openbts/shared/contract";
import { type AnyColumn, type SQL, asc, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { decodeCursor, encodeCursor } from "./cursor.js";

type KeyKind = "text" | "instant";

export type SortColumn = { column: AnyColumn; kind: KeyKind };
export type SortField<Sort extends string> = Sort extends `-${infer Field}` ? Field : Sort;
export type Keyset = {
  orderBy: SQL[];
  key: SQL<string | null>;
  after: SQL | undefined;
  cursorAfter: (row: { id: number | string; key: string | null }) => string;
};

const KEY_SCHEMAS: Record<KeyKind, z.ZodType<string>> = {
  text: z
    .string()
    .max(255)
    .refine((value) => !value.includes("\u0000")),
  instant: z.string().regex(/^-?\d{1,16}$/),
};

function readKey({ column, kind }: SortColumn): SQL<string> {
  return kind === "instant" ? sql<string>`(extract(epoch from ${column}) * 1000000)::bigint::text` : sql<string>`${column}::text`;
}

function bindKey(kind: KeyKind, key: string): SQL {
  return kind === "instant" ? sql`('epoch'::timestamptz + ${key}::bigint * interval '1 microsecond')` : sql`${key}`;
}

export function createKeyset<Sort extends string>(
  sort: Sort,
  id: AnyColumn,
  columns: Record<SortField<Sort>, SortColumn | null>,
  cursor: string | undefined,
  cursorIdSchema: z.ZodType<number | string> = idSchema,
): Keyset {
  const isDescending = sort.startsWith("-");
  const direction = isDescending ? desc : asc;
  const beyond = isDescending ? sql`<` : sql`>`;
  const sortColumn = columns[(isDescending ? sort.slice(1) : sort) as SortField<Sort>];

  if (sortColumn === null) {
    const last = cursor === undefined ? null : decodeCursor(cursor, z.object({ sort: z.literal(sort), id: cursorIdSchema }));

    return {
      orderBy: [direction(id)],
      key: sql<null>`NULL`,
      after: last ? sql`${id} ${beyond} ${last.id}` : undefined,
      cursorAfter: (row) => encodeCursor({ sort, id: row.id }),
    };
  }

  const { column, kind } = sortColumn;
  const last = cursor === undefined ? null : decodeCursor(cursor, z.object({ sort: z.literal(sort), id: cursorIdSchema, key: KEY_SCHEMAS[kind] }));

  return {
    orderBy: [direction(column), direction(id)],
    key: readKey(sortColumn),
    after: last ? sql`(${column}, ${id}) ${beyond} (${bindKey(kind, last.key)}, ${last.id})` : undefined,
    cursorAfter: (row) => encodeCursor({ sort, id: row.id, key: row.key }),
  };
}

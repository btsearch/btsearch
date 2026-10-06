import { createHash } from "node:crypto";
import { SI2PEMError, SI2PEM_ERROR_CODES, isSI2PEMError } from "si2pem-reader";
import { z } from "zod/v4";

import { withRedisStaleCache } from "../../lib/redisCache.js";
import type { ListWindow } from "./lists.js";

type RegisterPage<Row> = { count: number; rows: (Row | null)[] };
export type RegisterReader<Row> = (page: number, pageSize: number) => Promise<RegisterPage<Row> | null>;
type RegisterSource<Row> = {
  cacheKeyPrefix: string;
  cacheKeyParts: unknown[];
  cache: { freshTtlSeconds: number; staleTtlSeconds: number };
  voivodeship: string | undefined;
  fetchPage: (page: number, pageSize: number) => Promise<unknown>;
  toRow: (result: unknown) => Row | null;
};
type HeldPages<Row> = { read: RegisterReader<Row>; count: number; pages: Map<number, (Row | null)[]> };

const NOT_FOUND_STATUS = 404;
const registerPageSchema = z.object({ count: z.number().int().nonnegative(), results: z.array(z.unknown()) });

export const registerText = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);
export const registerCoordinate = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number());

async function fetchRegisterPage<Row>(
  page: number,
  fetchJson: () => Promise<unknown>,
  toRow: (result: unknown) => Row | null,
): Promise<RegisterPage<Row> | null> {
  let json: unknown;
  try {
    json = await fetchJson();
  } catch (error) {
    if (page > 1 && isSI2PEMError(error) && error.statusCode === NOT_FOUND_STATUS) return null;
    throw error;
  }

  const parsed = registerPageSchema.safeParse(json);
  if (!parsed.success) throw new SI2PEMError(SI2PEM_ERROR_CODES.invalidResponse, "SI2PEM returned an unexpected page", { cause: parsed.error });
  return { count: parsed.data.count, rows: parsed.data.results.map(toRow) };
}

export function registerReader<Row extends { regionName: string | null }>(source: RegisterSource<Row>): RegisterReader<Row> {
  const { cacheKeyPrefix, cacheKeyParts, cache, voivodeship, fetchPage, toRow } = source;

  return async (page, pageSize) => {
    const hash = createHash("sha256")
      .update(JSON.stringify([...cacheKeyParts, page, pageSize]))
      .digest("hex");
    const { value: found } = await withRedisStaleCache(
      `${cacheKeyPrefix}:${hash}`,
      { ...cache, shouldCache: (loaded: RegisterPage<Row> | null) => loaded !== null },
      () => fetchRegisterPage(page, () => fetchPage(page, pageSize), toRow),
    );
    if (found === null || voivodeship === undefined) return found;

    const wanted = voivodeship.toLowerCase();
    const rows = found.rows.map((row) => (row === null || row.regionName === null || row.regionName.toLowerCase() === wanted ? row : null));
    return { count: found.count, rows };
  };
}

async function holdFirstPages<Row>(read: RegisterReader<Row>, pageNumber: number, pageSize: number): Promise<HeldPages<Row>> {
  const page = await read(pageNumber, pageSize);
  if (page !== null) return { read, count: page.count, pages: new Map([[pageNumber, page.rows]]) };
  if (pageNumber === 1) return { read, count: 0, pages: new Map() };

  const first = await read(1, pageSize);
  return first === null ? { read, count: 0, pages: new Map() } : { read, count: first.count, pages: new Map([[1, first.rows]]) };
}

async function rowsBetween<Row>({ read, pages }: HeldPages<Row>, from: number, to: number, pageSize: number): Promise<(Row | null)[]> {
  if (from >= to) return [];

  const firstPage = Math.floor(from / pageSize) + 1;
  const lastPage = Math.floor((to - 1) / pageSize) + 1;
  const pageNumbers = Array.from({ length: lastPage - firstPage + 1 }, (_, index) => firstPage + index);
  const rows = await Promise.all(pageNumbers.map(async (pageNumber) => pages.get(pageNumber) ?? (await read(pageNumber, pageSize))?.rows ?? []));

  const start = from - (firstPage - 1) * pageSize;
  return rows.flat().slice(start, start + to - from);
}

export async function readRegisterWindow<Row>(
  readers: readonly RegisterReader<Row>[],
  { offset, limit }: ListWindow,
): Promise<{ total: number; rows: Row[] }> {
  const held = await Promise.all(readers.map((read, index) => holdFirstPages(read, index === 0 ? Math.floor(offset / limit) + 1 : 1, limit)));
  const slices = await Promise.all(
    held.map((entry, index) => {
      const start = held.slice(0, index).reduce((sum, earlier) => sum + earlier.count, 0);
      return rowsBetween(entry, Math.max(offset - start, 0), Math.min(offset + limit - start, entry.count), limit);
    }),
  );

  return {
    total: held.reduce((sum, entry) => sum + entry.count, 0),
    rows: slices.flat().filter((row): row is Row => row !== null),
  };
}

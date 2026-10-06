import { locations, regions, stations } from "@openbts/drizzle";
import type { SearchMatch, SearchMatchField, SearchSort } from "@openbts/shared/contract";
import { type SQL, asc, count, desc, eq, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import type { StationRow } from "../stations/serialize.js";
import { freeTextHits, toSearchMatch } from "./freeText.js";

type StationSearch = { text: string; filters: SQL | undefined; sort: SearchSort; limit: number; offset: number; includeTotal: boolean };
type FoundStation = { station: StationRow; match: SearchMatch | null };

const NO_MATCHES = sql`(
  SELECT NULL::integer AS match_rank, NULL::text AS match_field, NULL::text AS match_value, 0::real AS match_score
) AS best`;
const NEWEST_FIRST = desc(stations.id);
const BEST_MATCH_FIRST = [sql`best.match_rank`, sql`best.match_score DESC`, NEWEST_FIRST];
const SORT_ORDERS: Record<Exclude<SearchSort, "relevance">, SQL> = {
  siteId: asc(stations.station_id),
  "-siteId": desc(stations.station_id),
  createdAt: asc(stations.createdAt),
  "-createdAt": desc(stations.createdAt),
  updatedAt: asc(stations.updatedAt),
  "-updatedAt": desc(stations.updatedAt),
};

function bestMatches(text: string): { table: SQL; on: SQL } {
  if (text === "") return { table: NO_MATCHES, on: sql`true` };
  return { table: freeTextHits(text), on: eq(stations.id, sql`best.station_id`) };
}

async function countStations(text: string, filters: SQL | undefined): Promise<number> {
  const best = bestMatches(text);

  const [row] = await db
    .select({ total: count() })
    .from(stations)
    .innerJoin(best.table, best.on)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .where(filters);

  return row?.total ?? 0;
}

export async function findStations(search: StationSearch): Promise<{ found: FoundStation[]; total: number | null }> {
  const { text, filters, sort, limit, offset, includeTotal } = search;
  const best = bestMatches(text);
  const orderBy = sort === "relevance" ? BEST_MATCH_FIRST : [SORT_ORDERS[sort], NEWEST_FIRST];

  const rows = await db
    .select({
      station: stations,
      rank: sql<number | null>`best.match_rank`,
      field: sql<SearchMatchField | null>`best.match_field`,
      value: sql<string | null>`best.match_value`,
      total: includeTotal ? sql<number>`(count(*) OVER ())::integer` : sql<number>`0`,
    })
    .from(stations)
    .innerJoin(best.table, best.on)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .where(filters)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const found = rows.map(({ station, rank, field, value }) => ({
    station,
    match: rank === null || field === null || value === null ? null : toSearchMatch({ rank, field, value }),
  }));
  if (!includeTotal) return { found, total: null };

  const [first] = rows;
  if (first) return { found, total: first.total };
  return { found, total: offset === 0 ? 0 : await countStations(text, filters) };
}

import { locations, observationFlags, observedCells, observedSites, operators, regions, stations } from "@openbts/drizzle";
import { OFFSET_LIMIT } from "@openbts/shared/contract";
import type {
  ObservationFlag,
  ObservationFlagCounts,
  ObservationFlagInclude,
  ObservationFlagKind,
  ObservationFlagList,
  ObservationFlagListQuery,
  ObservationFlagSort,
  ObservationFlagStatus,
  Paging,
} from "@openbts/shared/contract";
import { type SQL, and, count, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { encodeCursor, resolveOffset } from "../../../lib/cursor.js";
import { type Keyset, type SortColumn, type SortField, createKeyset } from "../../../lib/keyset.js";
import { type EditorGrant, accessFromRequest } from "../../access/access.js";
import { observedSiteInArea, stationInArea } from "../../access/filters.js";
import { matchesFreeText } from "../../search/freeText.js";
import { guestStationCondition, operatorCondition } from "../../stations/read.js";
import { assertModeratesObservations, assertObservationsOn } from "../access.js";
import { findOperatorCodes } from "../networks.js";
import { kindsSeenBy } from "./kinds.js";
import { flagCountryCode, flagRegionId, selectFlags, serializeFlags } from "./serialize.js";
import { networkSubject } from "./subjects.js";
import { flagStatusOf } from "./sync.js";

type StationSort = Extract<ObservationFlagSort, "stationId" | "-stationId">;
type FlagOrder = Omit<Keyset, "cursorAfter"> & { offset: number; cursorAfter: (row: { id: number; key: string | null }) => string | null };

const SORT_COLUMNS: Record<SortField<Exclude<ObservationFlagSort, StationSort>>, SortColumn | null> = {
  createdAt: { column: observationFlags.createdAt, kind: "instant" },
  updatedAt: { column: observationFlags.updatedAt, kind: "instant" },
};
const DEFAULT_STATUSES: readonly ObservationFlagStatus[] = ["open"];

function flagsSeenBy(grants: readonly EditorGrant[]): SQL {
  const maintainedCountryCodes = grants.filter((grant) => grant.isMaintainer).map((grant) => grant.countryCode);
  const seen = or(
    and(
      inArray(observationFlags.kind, kindsSeenBy("area")),
      or(
        stationInArea(grants, observationFlags.stationId),
        and(isNull(observationFlags.stationId), observedSiteInArea(grants, observationFlags.countryCode, observationFlags.regionId)),
      ),
    ),
    maintainedCountryCodes.length === 0
      ? undefined
      : and(inArray(observationFlags.kind, kindsSeenBy("maintainers")), inArray(observationFlags.countryCode, maintainedCountryCodes)),
  );
  return seen ?? sql`false`;
}

async function resolveVisibleFlags(req: FastifyRequest): Promise<SQL | undefined> {
  await assertModeratesObservations(req);
  await assertObservationsOn(req);

  const access = await accessFromRequest(req);
  return access?.role === "admin" ? undefined : flagsSeenBy(access?.grants ?? []);
}

function statusCondition(status: ObservationFlagStatus): SQL | undefined {
  switch (status) {
    case "open":
      return isNull(observationFlags.closedReason);
    case "dismissed":
      return eq(observationFlags.closedReason, "dismissed");
    case "resolved":
      return and(isNotNull(observationFlags.closedReason), ne(observationFlags.closedReason, "dismissed"));
  }
}

async function operatorFlagCondition(operatorIds: readonly number[]): Promise<SQL> {
  const codes = await findOperatorCodes(operatorIds);
  const sitesOnNetworks = db.select({ id: observedSites.id }).from(observedSites).where(inArray(observedSites.plmn, codes));
  const cellsOnNetworks = db.select({ id: observedCells.id }).from(observedCells).where(inArray(observedCells.plmn, codes));
  const aboutStation = operatorCondition(operatorIds, false, "location", guestStationCondition(stations.id, operatorIds));
  const aboutObservation = or(
    inArray(observationFlags.observedSiteId, sitesOnNetworks),
    and(isNull(observationFlags.observedSiteId), inArray(observationFlags.observedCellId, cellsOnNetworks)),
  );
  const aboutNetwork = and(eq(observationFlags.kind, "gnbLengthSuggestion"), inArray(observationFlags.subjectKey, codes.map(networkSubject)));
  return (
    or(and(isNotNull(observationFlags.stationId), aboutStation), and(isNull(observationFlags.stationId), aboutObservation), aboutNetwork) ??
    sql`false`
  );
}

type FlagFilters = { visible: SQL | undefined; kinds: SQL | undefined; statuses: SQL | undefined; others: SQL | undefined };

async function resolveFilters(req: FastifyRequest, query: ObservationFlagListQuery): Promise<FlagFilters> {
  const { kinds, statuses, countryCodes, regionIds, stationIds, station, cellIds, observedSiteIds, operatorIds, updatedAfter } = query;
  const visible = await resolveVisibleFlags(req);
  const operated = operatorIds ? await operatorFlagCondition(operatorIds) : undefined;
  return {
    visible,
    kinds: kinds ? inArray(observationFlags.kind, kinds) : undefined,
    statuses: or(...(statuses ?? DEFAULT_STATUSES).map(statusCondition)),
    others: and(
      stationIds ? inArray(observationFlags.stationId, stationIds) : undefined,
      station ? matchesFreeText(station) : undefined,
      cellIds ? inArray(observationFlags.cellId, cellIds) : undefined,
      observedSiteIds ? inArray(observationFlags.observedSiteId, observedSiteIds) : undefined,
      countryCodes ? inArray(flagCountryCode, countryCodes) : undefined,
      regionIds ? inArray(flagRegionId, regionIds) : undefined,
      operated,
      updatedAfter ? gte(observationFlags.updatedAt, new Date(updatedAfter)) : undefined,
    ),
  };
}

function isStationSort(sort: ObservationFlagSort): sort is StationSort {
  return sort === "stationId" || sort === "-stationId";
}

function flagOrder({ sort, cursor, limit }: ObservationFlagListQuery): FlagOrder {
  if (!isStationSort(sort)) return { ...createKeyset(sort, observationFlags.id, SORT_COLUMNS, cursor), offset: 0 };

  const offset = resolveOffset({ cursor }, OFFSET_LIMIT);
  const nextOffset = offset + limit;
  const direction = sort === "stationId" ? sql`ASC` : sql`DESC`;
  return {
    orderBy: [sql`${observationFlags.stationId} ${direction} NULLS LAST`, sql`${observationFlags.id} DESC`],
    key: sql<null>`NULL`,
    after: undefined,
    offset,
    cursorAfter: () => (nextOffset > OFFSET_LIMIT ? null : encodeCursor({ offset: nextOffset })),
  };
}

function countFlags(where: SQL | undefined) {
  return db
    .select({ kind: observationFlags.kind, closedReason: observationFlags.closedReason, flags: count() })
    .from(observationFlags)
    .leftJoin(stations, eq(stations.id, observationFlags.stationId))
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .where(where)
    .groupBy(observationFlags.kind, observationFlags.closedReason);
}

type FlagCountRow = Awaited<ReturnType<typeof countFlags>>[number];

function sumBy<Key extends string>(rows: readonly FlagCountRow[], keyOf: (row: FlagCountRow) => Key): Partial<Record<Key, number>> {
  const sums: Partial<Record<Key, number>> = {};
  for (const row of rows) sums[keyOf(row)] = (sums[keyOf(row)] ?? 0) + row.flags;
  return sums;
}

function toCounts(rows: readonly FlagCountRow[], { kinds, statuses }: ObservationFlagListQuery): ObservationFlagCounts {
  const shownStatuses = statuses ?? DEFAULT_STATUSES;
  const ofKinds = rows.filter((row) => kinds === undefined || kinds.includes(row.kind));
  const ofStatuses = rows.filter((row) => shownStatuses.includes(flagStatusOf(row.closedReason)));
  return {
    kinds: sumBy<ObservationFlagKind>(ofStatuses, (row) => row.kind),
    statuses: sumBy<ObservationFlagStatus>(ofKinds, (row) => flagStatusOf(row.closedReason)),
  };
}

export async function listFlags(req: FastifyRequest, query: ObservationFlagListQuery): Promise<ObservationFlagList> {
  const { include, limit, includeTotal, includeCounts } = query;
  const filters = await resolveFilters(req, query);
  const matching = and(filters.visible, filters.kinds, filters.statuses, filters.others);
  const order = flagOrder(query);

  const [rows, totals, countRows] = await Promise.all([
    selectFlags(order.key)
      .where(and(matching, order.after))
      .orderBy(...order.orderBy)
      .limit(limit + 1)
      .offset(order.offset),
    includeTotal ? countFlags(matching) : null,
    includeCounts ? countFlags(and(filters.visible, filters.others)) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? order.cursorAfter({ id: last.flag.id, key: last.key }) : null };
  if (totals) paging.total = totals.reduce((total, row) => total + row.flags, 0);

  const data = await serializeFlags(req, page, include);
  return countRows ? { data, paging, counts: toCounts(countRows, query) } : { data, paging };
}

export async function readFlag(req: FastifyRequest, id: number, include: readonly ObservationFlagInclude[] | undefined): Promise<ObservationFlag> {
  const [row] = await selectFlags()
    .where(and(eq(observationFlags.id, id), await resolveVisibleFlags(req)))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");

  const [flag] = await serializeFlags(req, [row], include);
  if (flag === undefined) throw new ErrorResponse("NOT_FOUND");
  return flag;
}

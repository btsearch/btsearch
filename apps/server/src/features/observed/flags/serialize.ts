import { locations, observationFlags, operators, regions, stations, users } from "@openbts/drizzle";
import { observationFlagSchema } from "@openbts/shared/contract";
import type { ObservationFlag, ObservationFlagInclude } from "@openbts/shared/contract";
import { type SQL, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { logger } from "../../../utils/logger.js";
import { findListedCells, serializeCells } from "../../cells/read.js";
import { stationCountryCode } from "../../stations/country.js";
import { serializeStations } from "../../stations/read.js";
import { toUserRef } from "../../users/userRef.js";
import { loadObservedCellRecords } from "../cells/read.js";
import { toObservedCellRecord } from "../cells/serialize.js";
import { loadSitesSeenBy } from "../sites/read.js";
import { flagStatusOf } from "./sync.js";

export const flagCountryCode = sql<string | null>`COALESCE(${stationCountryCode}, ${observationFlags.countryCode})`;
export const flagRegionId = sql<number | null>`COALESCE(${locations.region_id}, ${observationFlags.regionId})`;

const flaggedUsers = alias(users, "flagged_users");

export function selectFlags(key: SQL<string | null> = sql<string | null>`NULL`) {
  return db
    .select({
      flag: observationFlags,
      countryCode: flagCountryCode,
      regionId: flagRegionId,
      resolver: { id: users.id, username: users.username, name: users.name, image: users.image },
      person: { id: flaggedUsers.id, username: flaggedUsers.username, name: flaggedUsers.name, image: flaggedUsers.image },
      key,
    })
    .from(observationFlags)
    .leftJoin(stations, eq(stations.id, observationFlags.stationId))
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .leftJoin(users, eq(users.id, observationFlags.resolvedById))
    .leftJoin(flaggedUsers, eq(flaggedUsers.id, observationFlags.userId));
}

export type FlagRow = Awaited<ReturnType<typeof selectFlags>>[number];

const unreadableFlagIds = new Set<number>();

function logUnreadable(id: number, event: string, issues: unknown): void {
  if (unreadableFlagIds.has(id)) return;
  unreadableFlagIds.add(id);
  logger.warn(event, { id, issues });
}

function readEvidence(flag: FlagRow["flag"], person: FlagRow["person"]): unknown {
  if (flag.kind !== "untrustedContributor") return flag.evidence;
  return Object.assign({}, flag.evidence, { user: person === null ? null : toUserRef(person) });
}

function toObservationFlag({ flag, countryCode, regionId, resolver, person }: FlagRow): ObservationFlag[] {
  const stored = {
    id: flag.id,
    status: flagStatusOf(flag.closedReason),
    closedReason: flag.closedReason,
    dismissedReason: flag.dismissedReason,
    observedSiteId: flag.observedSiteId,
    observedCellId: flag.observedCellId,
    stationId: flag.stationId,
    cellId: flag.cellId,
    sectorId: flag.sectorId,
    bandId: flag.bandId,
    deviceId: flag.deviceId,
    userId: flag.userId,
    countryCode,
    regionId,
    note: flag.note,
    createdAt: flag.createdAt.toISOString(),
    updatedAt: flag.updatedAt.toISOString(),
    resolvedAt: flag.resolvedAt?.toISOString() ?? null,
    resolvedBy: resolver === null ? null : toUserRef(resolver),
    kind: flag.kind,
    evidence: readEvidence(flag, person),
    suggestion: flag.suggestion,
  };
  const read = observationFlagSchema.safeParse(stored);
  if (read.success) return [read.data];

  const withoutSuggestion = observationFlagSchema.safeParse({ ...stored, suggestion: null });
  if (withoutSuggestion.success) {
    logUnreadable(flag.id, "observations.flags.unreadable_suggestion", read.error.issues);
    return [withoutSuggestion.data];
  }
  logUnreadable(flag.id, "observations.flags.unreadable_evidence", withoutSuggestion.error.issues);
  return [];
}

function found<T>(byId: ReadonlyMap<number, T>, id: number | null): T | null {
  return id === null ? null : (byId.get(id) ?? null);
}

export async function serializeFlags(
  req: FastifyRequest,
  rows: readonly FlagRow[],
  include: readonly ObservationFlagInclude[] = [],
): Promise<ObservationFlag[]> {
  const flags = rows.flatMap(toObservationFlag);
  const wantsStation = include.includes("station") || include.includes("station.location");
  const stationIds = wantsStation ? unique(flags.map((flag) => flag.stationId)) : [];
  const cellIds = include.includes("cell") ? unique(flags.map((flag) => flag.cellId)) : [];
  const observedCellIds = include.includes("observedCell") ? unique(flags.map((flag) => flag.observedCellId)) : [];
  const siteIds = include.includes("observedSite") ? unique(flags.map((flag) => flag.observedSiteId)) : [];
  const [stationRows, cellRows, observedCellRows, shownSites] = await Promise.all([
    stationIds.length === 0 ? [] : db.select().from(stations).where(inArray(stations.id, stationIds)),
    findListedCells(cellIds),
    loadObservedCellRecords(observedCellIds),
    loadSitesSeenBy(req, siteIds),
  ]);
  const [listedStations, listedCells] = await Promise.all([
    serializeStations(stationRows, include.includes("station.location") ? ["location"] : []),
    serializeCells(cellRows),
  ]);
  const stationsById = new Map(listedStations.map((station) => [station.id, station]));
  const cellsById = new Map(listedCells.map((cell) => [cell.id, cell]));
  const recordsById = new Map(
    observedCellRows.flatMap((rows) => {
      const record = toObservedCellRecord(rows);
      return record === null ? [] : [[rows.cell.id, record] as const];
    }),
  );

  for (const flag of flags) {
    if (wantsStation) flag.station = found(stationsById, flag.stationId);
    if (include.includes("cell")) flag.cell = found(cellsById, flag.cellId);
    if (include.includes("observedCell")) flag.observedCell = found(recordsById, flag.observedCellId);
    const site = flag.observedSiteId === null ? null : shownSites.get(flag.observedSiteId);
    if (include.includes("observedSite") && site !== undefined) flag.observedSite = site;
  }
  return flags;
}

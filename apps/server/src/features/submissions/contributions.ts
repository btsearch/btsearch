import { countries, locations, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { type PlacedLocation, type ScopeRefs, locationRefs, resolveScopeTargets } from "../access/scope.js";
import { isLegacyRequest, isOutsideLegacyCountry } from "../countries/legacy.js";
import type { SubmissionChange } from "./create.js";

type ChangeRefs = Required<Pick<ScopeRefs, "stationIds" | "regionIds" | "points" | "placements" | "operatorChanges">>;

export async function assertCountriesOpen(req: FastifyRequest, refs: ScopeRefs): Promise<void> {
  const targets = await resolveScopeTargets(refs);
  const countryCodes = unique(targets.map((target) => target.countryCode));
  if (isLegacyRequest(req) && countryCodes.some(isOutsideLegacyCountry)) throw new ErrorResponse("NOT_FOUND");
  if (countryCodes.length === 0) return;

  const [closed] = await db
    .select({ code: countries.code })
    .from(countries)
    .where(and(inArray(countries.code, countryCodes), eq(countries.contributions, "closed")))
    .limit(1);
  if (closed) throw new ErrorResponse("FORBIDDEN", { message: "This country is not accepting submissions" });
}

export async function loadCurrentLocations(stationIds: readonly number[]): Promise<Map<number, PlacedLocation>> {
  if (stationIds.length === 0) return new Map();

  const rows = await db
    .select({ stationId: stations.id, region_id: locations.region_id, longitude: locations.longitude, latitude: locations.latitude })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(inArray(stations.id, [...stationIds]));
  return new Map(rows.map(({ stationId, ...location }) => [stationId, location]));
}

function loadTouchedLocations(changes: readonly SubmissionChange[]): Promise<Map<number, PlacedLocation>> {
  return loadCurrentLocations(changes.flatMap((change) => (typeof change.station_id === "number" && change.location ? [change.station_id] : [])));
}

function changeRefs(change: SubmissionChange, current: ReadonlyMap<number, PlacedLocation>): ChangeRefs {
  const stationId = change.station_id ?? null;
  const placed = locationRefs(change.location ?? undefined, stationId === null ? null : current.get(stationId));
  const operatorId = change.station?.operator_id;
  const isPlaced = stationId !== null || typeof change.location?.region_id === "number";

  const changesOperator = stationId !== null && change.location === undefined && typeof operatorId === "number";
  return {
    stationIds: stationId === null ? [] : [stationId],
    regionIds: placed.regionIds ?? [],
    points: placed.points ?? [],
    placements: isPlaced || typeof operatorId !== "number" ? [] : [{ locationId: null, operatorId }],
    operatorChanges: changesOperator ? [{ stationId, operatorId, location: "kept" }] : [],
  };
}

export async function assertContributionsOpen(req: FastifyRequest, changes: readonly SubmissionChange[]): Promise<void> {
  if (changes.length === 0) return;

  const current = await loadTouchedLocations(changes);
  const refs = changes.map((change) => changeRefs(change, current));
  await assertCountriesOpen(req, {
    stationIds: refs.flatMap((ref) => ref.stationIds),
    regionIds: refs.flatMap((ref) => ref.regionIds),
    points: refs.flatMap((ref) => ref.points),
    placements: refs.flatMap((ref) => ref.placements),
    operatorChanges: refs.flatMap((ref) => ref.operatorChanges),
  });
}

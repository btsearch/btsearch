import { hasOfficialSites } from "@openbts/country-packs/sources";
import { locations, regions, stations } from "@openbts/drizzle";
import type { HostStationRefusalKind } from "@openbts/shared/contract";
import { type SQL, and, eq, inArray, notInArray, or } from "drizzle-orm";

import db from "../../database/psql.js";
import { DetailedErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { toFieldPath } from "../../lib/fieldPath.js";
import type { DbTx } from "../../types/global.js";
import { findLocationIdsAt } from "../access/scope.js";
import type { AuditRecorder } from "../audit/index.js";
import type { BodyPath } from "../submissions/translate.js";
import { findPlacementCountryCode } from "./country.js";

type Reader = Pick<DbTx, "select">;
type HostLink = Awaited<ReturnType<typeof selectHostLinks>>[number];
type Site = Pick<HostLink, "locationId" | "operatorId">;
type Guest = {
  stationId: number | null;
  operatorId: number | null;
  countryCode: string | null;
  locationIds: readonly number[];
  hostsOthers: boolean;
};
type Point = { longitude: number; latitude: number };
type ProposedPlace = { region_id?: number | null; longitude?: number | null; latitude?: number | null; move?: "station" | "location" | null };
type HostRequest = {
  stationId: number | null;
  hostStationId: number | null | undefined;
  operatorId: number | null | undefined;
  location: ProposedPlace | null | undefined;
};

const HOST_FIELD_PATH = ["station", "hostStationId"];
const HOST_REFUSAL_MESSAGES: Record<HostStationRefusalKind, string> = {
  hostComputed: "Host stations in this country are worked out from the official sites and cannot be set",
  hostElsewhere: "The host station must be at the same location as the station",
  hostSelf: "A station cannot host itself",
  hostSameOperator: "The host station must belong to another operator",
  hostIsHosted: "The host station has a host of its own",
  hostingStation: "A station that hosts other stations cannot get a host",
};

const linkColumns = {
  id: stations.id,
  locationId: stations.location_id,
  operatorId: stations.operator_id,
  hostStationId: stations.ran_host_station_id,
  countryCode: regions.countryCode,
  longitude: locations.longitude,
  latitude: locations.latitude,
};

function selectHostLinks(reader: Reader, stationIds: readonly number[], requestedHostId: number | null) {
  const linked =
    stationIds.length === 0
      ? undefined
      : or(
          inArray(stations.ran_host_station_id, [...stationIds]),
          inArray(
            stations.id,
            reader
              .select({ id: stations.ran_host_station_id })
              .from(stations)
              .where(inArray(stations.id, [...stationIds])),
          ),
        );
  return reader
    .select(linkColumns)
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .where(or(inArray(stations.id, unique([...stationIds, requestedHostId])), linked));
}

function lockHostLinks(tx: DbTx, stationIds: readonly number[], requestedHostId: number | null) {
  return selectHostLinks(tx, stationIds, requestedHostId).for("no key update", { of: stations });
}

function sharesSite(guest: Site, host: Site): boolean {
  if (guest.locationId === null || guest.locationId !== host.locationId) return false;
  return guest.operatorId === null || guest.operatorId !== host.operatorId;
}

function isComputed(countryCode: string | null): boolean {
  return countryCode !== null && hasOfficialSites(countryCode);
}

function hostRefusal(kind: HostStationRefusalKind, bodyPath: BodyPath = (path) => path): DetailedErrorResponse {
  return new DetailedErrorResponse("BAD_REQUEST", [{ field: toFieldPath(bodyPath(HOST_FIELD_PATH)), kind }], {
    message: HOST_REFUSAL_MESSAGES[kind],
  });
}

function findHostRefusal(guest: Guest, hostStationId: number | null, host: HostLink | undefined): HostStationRefusalKind | null {
  if (isComputed(guest.countryCode)) return "hostComputed";
  if (hostStationId === null) return null;
  if (hostStationId === guest.stationId) return "hostSelf";
  if (host === undefined || host.locationId === null || !guest.locationIds.includes(host.locationId)) return "hostElsewhere";
  if (isComputed(host.countryCode)) return "hostComputed";
  if (host.operatorId !== null && host.operatorId === guest.operatorId) return "hostSameOperator";
  if (host.hostStationId !== null) return "hostIsHosted";
  if (guest.hostsOthers) return "hostingStation";
  return null;
}

function refuseUnfitHost(guest: Guest, hostStationId: number | null, links: readonly HostLink[], bodyPath?: BodyPath): void {
  const host = links.find((link) => link.id === hostStationId);
  const kind = findHostRefusal(guest, hostStationId, host);
  if (kind !== null) throw hostRefusal(kind, bodyPath);
}

function findBrokenLinkIds(stationIds: readonly number[], links: readonly HostLink[]): number[] {
  const linksById = new Map(links.map((link) => [link.id, link]));
  const hostIdOf = new Map(links.map((link) => [link.id, link.hostStationId]));
  const brokenIds = new Set<number>();
  const dropHost = (guestId: number) => {
    hostIdOf.set(guestId, null);
    brokenIds.add(guestId);
  };

  for (const stationId of stationIds) {
    const station = linksById.get(stationId);
    if (station === undefined) continue;

    const guests = links.filter((link) => hostIdOf.get(link.id) === stationId);
    for (const guest of guests) if (!sharesSite(guest, station)) dropHost(guest.id);
    const hostId = hostIdOf.get(stationId);
    const host = typeof hostId === "number" ? linksById.get(hostId) : undefined;
    const hostsGuests = guests.some((guest) => hostIdOf.get(guest.id) === stationId);
    if (host !== undefined && (!sharesSite(station, host) || hostIdOf.get(host.id) !== null || hostsGuests)) dropHost(stationId);
  }
  return [...brokenIds];
}

function proposedPoint(location: ProposedPlace | null | undefined): Point | null {
  const longitude = location?.longitude;
  const latitude = location?.latitude;
  return typeof longitude === "number" && typeof latitude === "number" ? { longitude, latitude } : null;
}

function destinationLocationIds(
  station: HostLink | undefined,
  location: ProposedPlace | null | undefined,
  idsAtPoint: readonly number[],
): readonly number[] {
  if (location === null) return [];

  const currentIds = typeof station?.locationId === "number" ? [station.locationId] : [];
  const point = proposedPoint(location);
  if (point === null || (station?.longitude === point.longitude && station.latitude === point.latitude)) return currentIds;
  return location?.move === "location" ? [...currentIds, ...idsAtPoint] : idsAtPoint;
}

async function clearHostLinks(audit: AuditRecorder, condition: SQL | undefined): Promise<void> {
  const { tx } = audit;
  const previous = await tx.select().from(stations).where(condition);
  if (previous.length === 0) return;

  const previousById = new Map(previous.map((row) => [row.id, row]));
  const cleared = await tx
    .update(stations)
    .set({ ran_host_station_id: null, updatedAt: new Date() })
    .where(inArray(stations.id, [...previousById.keys()]))
    .returning();
  await audit.logMany(
    cleared.map((row) => ({
      entity: "stations" as const,
      op: "update" as const,
      recordId: row.id,
      stationId: row.id,
      old: previousById.get(row.id),
      new: row,
      metadata: audit.entryMetadata,
    })),
  );
}

async function clearBrokenLinks(audit: AuditRecorder, stationIds: readonly number[], links: readonly HostLink[]): Promise<void> {
  const brokenIds = findBrokenLinkIds(stationIds, links);
  if (brokenIds.length > 0) await clearHostLinks(audit, inArray(stations.id, brokenIds));
}

export async function assertHostStationFits({ stationId, hostStationId, operatorId, location }: HostRequest, bodyPath?: BodyPath): Promise<void> {
  if (hostStationId === undefined) return;

  const point = hostStationId === null ? null : proposedPoint(location);
  const [countryCode, links, idsAtPoint] = await Promise.all([
    findPlacementCountryCode({ stationId, regionId: location?.region_id, operatorId, withoutLocation: location === null }),
    hostStationId === null ? [] : selectHostLinks(db, stationId === null ? [] : [stationId], hostStationId),
    findLocationIdsAt(point === null ? [] : [point]),
  ]);
  const station = links.find((link) => link.id === stationId);
  const locationIds = destinationLocationIds(station, location, idsAtPoint);
  const staying = typeof station?.locationId === "number" && locationIds.includes(station.locationId) ? station : undefined;
  const site = { locationId: staying?.locationId ?? null, operatorId: operatorId ?? station?.operatorId ?? null };
  const hostsOthers = stationId !== null && links.some((link) => link.hostStationId === stationId && sharesSite(link, site));
  refuseUnfitHost({ stationId, operatorId: site.operatorId, countryCode, locationIds, hostsOthers }, hostStationId, links, bodyPath);
}

export async function settleHostLinks(audit: AuditRecorder, stationId: number, requestedHostId: number | null | undefined): Promise<void> {
  const links = await lockHostLinks(audit.tx, [stationId], requestedHostId ?? null);
  const station = links.find((link) => link.id === stationId);
  if (station === undefined) return;

  if (typeof requestedHostId === "number") {
    const locationIds = station.locationId === null ? [] : [station.locationId];
    const hostsOthers = links.some((link) => link.hostStationId === stationId && sharesSite(link, station));
    refuseUnfitHost(
      { stationId, operatorId: station.operatorId, countryCode: station.countryCode, locationIds, hostsOthers },
      requestedHostId,
      links,
    );
  }
  await clearBrokenLinks(audit, [stationId], links);
}

export async function clearBrokenHostLinks(audit: AuditRecorder, stationIds: readonly number[]): Promise<void> {
  if (stationIds.length === 0) return;
  await clearBrokenLinks(audit, stationIds, await lockHostLinks(audit.tx, stationIds, null));
}

export async function clearGuestLinks(audit: AuditRecorder, hostStationIds: readonly number[]): Promise<void> {
  await clearHostLinks(audit, and(inArray(stations.ran_host_station_id, hostStationIds), notInArray(stations.id, [...hostStationIds])));
}

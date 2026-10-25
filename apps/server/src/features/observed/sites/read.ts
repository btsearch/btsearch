import { cellNetworks, observedCellSummaries, observedCells, observedSites, siteGroups, siteReplacements } from "@openbts/drizzle";
import type {
  ObservedCellRecord,
  ObservedSite,
  ObservedSiteNotPublicReason,
  ObservedSiteStatus,
  SnapTarget,
  UserRef,
} from "@openbts/shared/contract";
import { and, asc, eq, inArray, max, min } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { unique } from "../../../lib/collections.js";
import { type ActorAccess, accessFromRequest, coversTarget } from "../../access/access.js";
import { hasStaffPermission } from "../../access/staff.js";
import { findGnbidLengths } from "../../analyzer/match.js";
import { toUserRef } from "../../users/userRef.js";
import { assertModeratesObservations, assertObservationsOn, ownDataUserId } from "../access.js";
import { namedByTwoPeople } from "../cells/confirmation.js";
import { type Network, loadNetworks } from "../networks.js";
import { type ObservedSiteRow, selectObservedSites } from "./select.js";
import { type ObservedSiteView, snapTargetOf, toObservedSite } from "./serialize.js";
import { findSitesMeasuredBy } from "./visibility.js";

export type ShownEstimate = {
  of: "group" | "site";
  calibrationRunId: number | null;
  estimatedAt: Date;
  latitude: number;
  longitude: number;
  uncertaintyM: number;
  ellipse: { majorM: number; minorM: number; azimuthDeg: number };
  alternative: { latitude: number; longitude: number } | null;
  isConsistent: boolean;
  sampleCount: number;
  contributorCount: number;
  personCount: number;
  binCount: number;
  taSampleCount: number;
  angularCoverageDeg: number;
  distinctDays: number;
  maxDistanceM: number;
};

export type ObservedSiteRecord = {
  id: number;
  plmn: string;
  rat: ObservedSiteRow["rat"];
  nodeId: number | null;
  stationId: number | null;
  retiredAt: Date | null;
  primarySiteId: number;
  copyOfObservedSiteId: number | null;
  group: { leadSiteId: number; memberSiteIds: number[] } | null;
  estimate: ShownEstimate | null;
  snap: { target: SnapTarget; probability: number; latitude: number; longitude: number; city: string | null; address: string | null } | null;
  status: ObservedSiteStatus;
  matchedStationId: number | null;
  suggestedStationId: number | null;
  isConfirmed: boolean;
  isPublic: boolean;
  notPublicReasons: ObservedSiteNotPublicReason[];
  isCountryShown: boolean;
  countryCode: string | null;
  regionId: number | null;
  algorithmVersion: number;
  plmns: string[];
  operatorId: number | null;
  guestOperatorIds: number[];
  gnbidLength: number | null;
  firstSeenOn: string | null;
  lastSeenOn: string | null;
  replacedByObservedSiteIds: number[];
  ignore: { reason: string; by: UserRef | null; at: Date } | null;
  handLink: { stationId: number; by: UserRef; at: Date } | null;
};

function estimateOf(row: ObservedSiteRow): ShownEstimate | null {
  if (row.estimateOf === null) return null;

  const { alternativeLatitude, alternativeLongitude } = row;
  return {
    of: row.estimateOf,
    calibrationRunId: row.calibrationRunId,
    estimatedAt: row.estimatedAt,
    latitude: row.latitude,
    longitude: row.longitude,
    uncertaintyM: row.uncertaintyM,
    ellipse: { majorM: row.ellipseMajorM, minorM: row.ellipseMinorM, azimuthDeg: row.ellipseAzimuthDeg },
    alternative:
      alternativeLatitude === null || alternativeLongitude === null ? null : { latitude: alternativeLatitude, longitude: alternativeLongitude },
    isConsistent: row.isConsistent,
    sampleCount: Number(row.sampleCount),
    contributorCount: row.contributorCount,
    personCount: row.personCount,
    binCount: row.binCount,
    taSampleCount: Number(row.taSampleCount),
    angularCoverageDeg: row.angularCoverageDeg,
    distinctDays: row.distinctDays,
    maxDistanceM: row.maxDistanceM,
  };
}

function snapOf(row: ObservedSiteRow): ObservedSiteRecord["snap"] {
  const target = snapTargetOf({ locationId: row.snapLocationId, officialSiteId: row.snapOfficialSiteId, observedSiteId: row.snapObservedSiteId });
  const { snapProbability, snapLatitude, snapLongitude } = row;
  if (target === null || snapProbability === null || snapLatitude === null || snapLongitude === null) return null;
  return { target, probability: snapProbability, latitude: snapLatitude, longitude: snapLongitude, city: row.snapCity, address: row.snapAddress };
}

async function loadGroupMembers(rows: readonly ObservedSiteRow[]): Promise<Map<number, number[]>> {
  const leadSiteIds = unique(rows.map((row) => row.leadSiteId));
  const [first] = rows;
  if (leadSiteIds.length === 0 || first === undefined) return new Map();

  const members = await db
    .select({ leadSiteId: siteGroups.leadSiteId, observedSiteId: siteGroups.observedSiteId })
    .from(siteGroups)
    .where(and(inArray(siteGroups.leadSiteId, leadSiteIds), eq(siteGroups.algorithmVersion, first.algorithmVersion)))
    .orderBy(asc(siteGroups.observedSiteId));
  return new Map(
    [...Map.groupBy(members, (member) => member.leadSiteId)].map(([leadSiteId, group]) => [leadSiteId, group.map((member) => member.observedSiteId)]),
  );
}

async function loadBroadcastNetworks(
  rows: readonly ObservedSiteRow[],
): Promise<{ plmnsBySite: Map<number, string[]>; networks: Map<string, Network> }> {
  const siteIds = rows.map((row) => row.id);
  const broadcast = await db
    .selectDistinct({ siteId: observedCells.observedSiteId, plmn: cellNetworks.plmn })
    .from(cellNetworks)
    .innerJoin(observedCells, eq(observedCells.id, cellNetworks.observedCellId))
    .where(and(inArray(observedCells.observedSiteId, siteIds), namedByTwoPeople(cellNetworks.contributorBits)));
  const broadcastBySite = Map.groupBy(broadcast, (network) => network.siteId);
  const plmnsBySite = new Map(
    rows.map((row) => {
      const others = (broadcastBySite.get(row.id) ?? []).map((network) => network.plmn).filter((plmn) => plmn !== row.plmn);
      return [row.id, [row.plmn, ...unique(others).toSorted()]];
    }),
  );
  return { plmnsBySite, networks: await loadNetworks([...plmnsBySite.values()].flat()) };
}

async function loadSeenDays(rows: readonly ObservedSiteRow[]) {
  const siteIds = rows.map((row) => row.id);
  const days = await db
    .select({
      siteId: observedCells.observedSiteId,
      firstSeenOn: min(observedCellSummaries.firstSeenOn),
      lastSeenOn: max(observedCellSummaries.lastSeenOn),
    })
    .from(observedCells)
    .innerJoin(observedCellSummaries, eq(observedCellSummaries.observedCellId, observedCells.id))
    .where(inArray(observedCells.observedSiteId, siteIds))
    .groupBy(observedCells.observedSiteId);
  return new Map(days.map(({ siteId, ...seen }) => [siteId, seen]));
}

async function loadReplacements(rows: readonly ObservedSiteRow[]): Promise<Map<number, number[]>> {
  const retiredIds = rows.filter((row) => row.retiredAt !== null).map((row) => row.id);
  if (retiredIds.length === 0) return new Map();

  const replacements = await db
    .select({ observedSiteId: siteReplacements.observedSiteId, replacedBySiteId: siteReplacements.replacedBySiteId })
    .from(siteReplacements)
    .where(inArray(siteReplacements.observedSiteId, retiredIds))
    .orderBy(asc(siteReplacements.replacedBySiteId));
  return new Map(
    [...Map.groupBy(replacements, (replacement) => replacement.observedSiteId)].map(([siteId, found]) => [
      siteId,
      found.map((replacement) => replacement.replacedBySiteId),
    ]),
  );
}

async function loadGnbidLengths(rows: readonly ObservedSiteRow[]): Promise<Map<string, number>> {
  const nrPlmns = unique(rows.filter((row) => row.rat === "NR").map((row) => row.plmn));
  return nrPlmns.length === 0 ? new Map() : findGnbidLengths(nrPlmns);
}

export async function completeObservedSites(rows: readonly ObservedSiteRow[]): Promise<ObservedSiteRecord[]> {
  if (rows.length === 0) return [];

  const [members, { plmnsBySite, networks }, seenDays, replacements, gnbidLengths] = await Promise.all([
    loadGroupMembers(rows),
    loadBroadcastNetworks(rows),
    loadSeenDays(rows),
    loadReplacements(rows),
    loadGnbidLengths(rows),
  ]);
  const operatorOf = (plmn: string) => networks.get(plmn)?.operatorId;

  return rows.map((row) => {
    const sitePlmns = plmnsBySite.get(row.id) ?? [row.plmn];
    const operatorId = operatorOf(row.plmn) ?? null;
    const seen = seenDays.get(row.id);
    return {
      id: row.id,
      plmn: row.plmn,
      rat: row.rat,
      nodeId: row.nodeId,
      stationId: row.stationId,
      retiredAt: row.retiredAt,
      primarySiteId: row.primarySiteId,
      copyOfObservedSiteId: row.copyOfObservedSiteId,
      group: row.leadSiteId === null ? null : { leadSiteId: row.leadSiteId, memberSiteIds: members.get(row.leadSiteId) ?? [] },
      estimate: estimateOf(row),
      snap: row.estimateOf === null ? null : snapOf(row),
      status: row.status,
      matchedStationId: row.status === "matched" ? row.linkStationId : null,
      suggestedStationId: row.status === "suggested" ? row.linkStationId : null,
      isConfirmed: row.isConfirmed,
      isPublic: row.notPublicReasons.length === 0,
      notPublicReasons: row.notPublicReasons,
      isCountryShown: row.isCountryShown,
      countryCode: row.countryCode,
      regionId: row.regionId,
      algorithmVersion: row.algorithmVersion,
      plmns: sitePlmns,
      operatorId,
      guestOperatorIds: unique(sitePlmns.slice(1).map(operatorOf)).filter((id) => id !== operatorId),
      gnbidLength: row.rat === "NR" ? (gnbidLengths.get(row.plmn) ?? null) : null,
      firstSeenOn: seen?.firstSeenOn ?? null,
      lastSeenOn: seen?.lastSeenOn ?? null,
      replacedByObservedSiteIds: replacements.get(row.id) ?? [],
      ignore:
        row.status === "ignored" && row.ignore !== null ? { ...row.ignore, by: row.ignoredBy === null ? null : toUserRef(row.ignoredBy) } : null,
      handLink:
        row.status === "matched" && row.linkedBy !== null && row.linkStationId !== null
          ? { stationId: row.linkStationId, by: toUserRef(row.linkedBy), at: row.linkedAt }
          : null,
    };
  });
}

export async function loadObservedSites(siteIds: readonly number[]): Promise<ObservedSiteRecord[]> {
  if (siteIds.length === 0) return [];

  const { query } = selectObservedSites();
  return completeObservedSites(await query.where(inArray(observedSites.id, [...siteIds])));
}

async function staffAccessOf(req: FastifyRequest): Promise<ActorAccess | null> {
  return (await hasStaffPermission(req, { observations: ["moderate"] })) ? accessFromRequest(req) : null;
}

async function findViews(
  req: FastifyRequest,
  sites: readonly ObservedSiteRecord[],
  access: ActorAccess | null,
): Promise<Map<number, ObservedSiteView>> {
  const views = new Map<number, ObservedSiteView>();
  for (const site of sites) {
    if (access !== null && coversTarget(access, site)) views.set(site.id, "staff");
    else if (site.isPublic) views.set(site.id, "public");
  }

  const userId = ownDataUserId(req);
  const unseen = sites.filter((site) => !views.has(site.id) && site.isCountryShown);
  if (userId !== null) for (const siteId of await findSitesMeasuredBy(userId, unseen)) views.set(siteId, "public");
  return views;
}

export async function loadSitesSeenBy(req: FastifyRequest, siteIds: readonly number[]): Promise<Map<number, ObservedSite>> {
  if (siteIds.length === 0) return new Map();

  const [sites, access] = await Promise.all([loadObservedSites(siteIds), staffAccessOf(req)]);
  const views = await findViews(req, sites, access);
  return new Map(
    sites.flatMap((site): [number, ObservedSite][] => {
      const view = views.get(site.id);
      return view === undefined ? [] : [[site.id, toObservedSite(site, undefined, view)]];
    }),
  );
}

export async function withObservedSites(req: FastifyRequest, records: readonly ObservedCellRecord[]): Promise<ObservedCellRecord[]> {
  const shownSites = await loadSitesSeenBy(req, unique(records.map((record) => record.observedSiteId)));
  return records.map((record) => {
    if (record.observedSiteId === null) return { ...record, observedSite: null };
    const site = shownSites.get(record.observedSiteId);
    return site === undefined ? record : { ...record, observedSite: site };
  });
}

export async function findSiteForCaller(req: FastifyRequest, siteId: number): Promise<{ site: ObservedSiteRecord; view: ObservedSiteView }> {
  await assertObservationsOn(req);

  const [[site], access] = await Promise.all([loadObservedSites([siteId]), staffAccessOf(req)]);
  const view = site === undefined ? undefined : (await findViews(req, [site], access)).get(site.id);
  if (site === undefined || view === undefined) throw new ErrorResponse("NOT_FOUND");
  return { site, view };
}

export async function findVisibleSite(req: FastifyRequest, siteId: number): Promise<{ site: ObservedSiteRecord; access: ActorAccess }> {
  await assertObservationsOn(req);
  await assertModeratesObservations(req);

  const [access, [site]] = await Promise.all([accessFromRequest(req), loadObservedSites([siteId])]);
  if (site === undefined || access === null || !coversTarget(access, site)) throw new ErrorResponse("NOT_FOUND");
  return { site, access };
}

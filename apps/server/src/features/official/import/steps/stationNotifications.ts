import { locations, officialLocations, officialPermits, officialSites, stations, stationsOfficialSites } from "@openbts/drizzle";
import { count, eq, sql } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import { idsIn } from "../../../../lib/conditions.js";
import type { DbTx } from "../../../../types/global.js";
import { buildInternalStationActionUrl, buildOfficialSiteActionUrl } from "../../../notifications/actionUrls.js";
import { notifyStationsWatchers } from "../../../notifications/service.js";
import type { StationLink } from "../../linkRule.js";
import { readEveryChange } from "../changes.js";
import type { AfterStep, AfterStepContext, ChangeKind, ChangeRow } from "../types.js";
import { notifyInPages } from "./notificationPages.js";
import { SITE_CHANGE_KINDS, type SiteChangeSummary, summarizeSiteChanges } from "./siteChanges.js";

type LinkState = { wasLinked: boolean; isLinked: boolean };
type LinkTally = { lastSeq: number; linksBySite: Map<number, LinkState> };
type StationNotification = Parameters<typeof notifyStationsWatchers>[0][number];
type SiteChanges = ReadonlyMap<number, SiteChangeSummary>;

export type StationLinkSummary = {
  stationId: number;
  lastSeq: number;
  linkedSiteId: number | null;
  unlinkedSiteId: number | null;
  keptSiteId: number | null;
};
export type StoredStation = { id: number; siteCode: string; latitude: number | null; longitude: number | null };
export type LinkedSite = { id: number; latitude: number; longitude: number; permitCount: number };

const LINK_CHANGE_KINDS: readonly ChangeKind[] = ["station_linked", "station_unlinked"];

export function summarizeStationLinks(changes: readonly ChangeRow[]): StationLinkSummary[] {
  const linkChanges = changes.filter((change) => LINK_CHANGE_KINDS.includes(change.kind));
  const tallies = new Map<number, LinkTally>();
  for (const change of linkChanges.toSorted((first, second) => first.seq - second.seq)) {
    if (change.stationId === null || change.officialSiteId === null) continue;

    const known = tallies.get(change.stationId);
    const tally = known ?? { lastSeq: change.seq, linksBySite: new Map<number, LinkState>() };
    if (!known) tallies.set(change.stationId, tally);

    const isLinked = change.kind === "station_linked";
    const link = tally.linksBySite.get(change.officialSiteId);
    tally.lastSeq = change.seq;
    if (link) link.isLinked = isLinked;
    else tally.linksBySite.set(change.officialSiteId, { wasLinked: !isLinked, isLinked });
  }

  return [...tallies]
    .map(([stationId, tally]) => {
      const changedLinks = [...tally.linksBySite].filter(([, link]) => link.isLinked !== link.wasLinked);
      return {
        stationId,
        lastSeq: tally.lastSeq,
        linkedSiteId: changedLinks.find(([, link]) => link.isLinked)?.[0] ?? null,
        unlinkedSiteId: changedLinks.find(([, link]) => !link.isLinked)?.[0] ?? null,
        keptSiteId: null,
      };
    })
    .toSorted((first, second) => first.lastSeq - second.lastSeq);
}

export function withKeptLinks(
  summaries: readonly StationLinkSummary[],
  keptLinks: readonly StationLink[],
  siteChanges: SiteChanges,
): StationLinkSummary[] {
  const summariesByStation = new Map(summaries.map((summary) => [summary.stationId, summary]));
  for (const { stationId, officialSiteId } of keptLinks) {
    const siteChange = siteChanges.get(officialSiteId);
    const summary: StationLinkSummary = summariesByStation.get(stationId) ?? {
      stationId,
      lastSeq: 0,
      linkedSiteId: null,
      unlinkedSiteId: null,
      keptSiteId: null,
    };
    if (!siteChange || summary.linkedSiteId === officialSiteId) continue;

    summariesByStation.set(stationId, { ...summary, lastSeq: Math.max(summary.lastSeq, siteChange.lastSeq), keptSiteId: officialSiteId });
  }
  return [...summariesByStation.values()].toSorted((first, second) => first.lastSeq - second.lastSeq);
}

function valueAt<Value>(values: ReadonlyMap<number, Value>, siteId: number | null): Value | undefined {
  return siteId === null ? undefined : values.get(siteId);
}

export function stationNotificationOf(
  summary: StationLinkSummary,
  station: StoredStation,
  sites: ReadonlyMap<number, LinkedSite>,
  siteChanges: SiteChanges,
): StationNotification | null {
  const { linkedSiteId, unlinkedSiteId, keptSiteId } = summary;
  const linkedSite = valueAt(sites, linkedSiteId);
  const unlinkedChange = valueAt(siteChanges, unlinkedSiteId);
  const keptChange = valueAt(siteChanges, keptSiteId);
  const unlinkedPermitsBeforeRun =
    (valueAt(sites, unlinkedSiteId)?.permitCount ?? 0) - (unlinkedChange?.permitsAdded ?? 0) + (unlinkedChange?.permitsArchived ?? 0);

  const permitsAdded = (linkedSite?.permitCount ?? 0) + (keptChange?.permitsAdded ?? 0);
  const permitsDeleted = unlinkedPermitsBeforeRun + (keptChange?.permitsArchived ?? 0);
  const sitesAdded = valueAt(siteChanges, linkedSiteId)?.wasAdded ? 1 : 0;
  const total = permitsAdded + permitsDeleted + sitesAdded;
  if (total === 0) return null;

  const actionSite = linkedSite ?? (keptChange !== undefined && keptChange.permitsAdded > 0 ? valueAt(sites, keptSiteId) : undefined);
  const ownLocation =
    station.latitude !== null && station.longitude !== null ? { latitude: station.latitude, longitude: station.longitude } : undefined;

  return {
    stationId: station.id,
    stationStringId: station.siteCode,
    type: "station_official_permit_added",
    metadata: { permits_added: permitsAdded, permits_deleted: permitsDeleted, official_sites_added: sitesAdded, count: total },
    actionUrl: actionSite
      ? buildOfficialSiteActionUrl({ id: actionSite.id, location: { latitude: actionSite.latitude, longitude: actionSite.longitude } })
      : buildInternalStationActionUrl({ id: station.id, location: ownLocation }),
  };
}

async function readStations(tx: DbTx, stationIds: readonly number[]): Promise<Map<number, StoredStation>> {
  const stored = await tx
    .select({ id: stations.id, siteCode: stations.station_id, latitude: locations.latitude, longitude: locations.longitude })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .where(sql`${stations.id} IN ${idsIn(stationIds)}`);
  return new Map(stored.map((station) => [station.id, station]));
}

async function readSites(tx: DbTx, officialSiteIds: readonly number[]): Promise<Map<number, LinkedSite>> {
  if (officialSiteIds.length === 0) return new Map();

  const stored = await tx
    .select({
      id: officialSites.id,
      latitude: officialLocations.latitude,
      longitude: officialLocations.longitude,
      permitCount: count(officialPermits.id),
    })
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .leftJoin(officialPermits, eq(officialPermits.official_site_id, officialSites.id))
    .where(sql`${officialSites.id} IN ${idsIn(officialSiteIds)}`)
    .groupBy(officialSites.id, officialLocations.id);
  return new Map(stored.map((site) => [site.id, site]));
}

async function readLinksOfSites(tx: DbTx, officialSiteIds: readonly number[]): Promise<StationLink[]> {
  if (officialSiteIds.length === 0) return [];

  return tx
    .select({ stationId: stationsOfficialSites.station_id, officialSiteId: stationsOfficialSites.official_site_id })
    .from(stationsOfficialSites)
    .where(sql`${stationsOfficialSites.official_site_id} IN ${idsIn(officialSiteIds)}`);
}

async function notifyStations(tx: DbTx, summaries: readonly StationLinkSummary[], siteChanges: SiteChanges): Promise<void> {
  const storedStations = await readStations(
    tx,
    summaries.map((summary) => summary.stationId),
  );
  const sites = await readSites(tx, unique(summaries.flatMap((summary) => [summary.linkedSiteId, summary.unlinkedSiteId, summary.keptSiteId])));
  const notifications = summaries.flatMap((summary) => {
    const station = storedStations.get(summary.stationId);
    const notification = station ? stationNotificationOf(summary, station, sites, siteChanges) : null;
    return notification ? [notification] : [];
  });
  await notifyStationsWatchers(notifications, tx);
}

async function perform(context: AfterStepContext): Promise<void> {
  const { summaries, siteChanges } = await context.transaction(async (tx) => {
    const changes = await readEveryChange(tx, context.run.id, [...SITE_CHANGE_KINDS, ...LINK_CHANGE_KINDS]);
    const siteSummaries = summarizeSiteChanges(changes.filter((change) => SITE_CHANGE_KINDS.includes(change.kind)));
    const permitChangedSiteIds = siteSummaries.filter((site) => site.permitsAdded > 0 || site.permitsArchived > 0).map((site) => site.officialSiteId);
    const keptLinks = await readLinksOfSites(tx, permitChangedSiteIds);
    const changesBySite = new Map(siteSummaries.map((site) => [site.officialSiteId, site]));
    return { summaries: withKeptLinks(summarizeStationLinks(changes), keptLinks, changesBySite), siteChanges: changesBySite };
  });
  await notifyInPages(context, summaries, (tx, page) => notifyStations(tx, page, siteChanges));
}

export const stationNotifications: AfterStep = { name: "station_notifications", runsInDryRun: false, perform };

import type { ObservedSite } from "@openbts/shared/contract";
import type { CellRat } from "@openbts/shared/contract/constants";

import type { EstimatedSiteStatus } from "../../data/mapFilters";
import { type MapLookups, getOperatorLook } from "../../data/mapLookups";
import type { EstimatedSiteSource } from "../api/observedQueries";
import { type CrowdTheme, MUTED_MARK_COLORS } from "../style/palette";
import { type RingLook, getRingImageId } from "./siteRingImages";

export type EstimatedSiteEntry = { site: ObservedSite; source: EstimatedSiteSource };

export type EstimatedSiteMarker = {
  key: string;
  latitude: number;
  longitude: number;
  entries: EstimatedSiteEntry[];
  ringImageId: string;
  ring: RingLook;
};

type EstimatedSiteFilter = {
  operatorIds: readonly number[];
  rats: readonly CellRat[];
  statuses: readonly EstimatedSiteStatus[] | null;
};

type SiteList = readonly [source: EstimatedSiteSource, sites: readonly ObservedSite[] | undefined];

const SOURCE_RANK: Record<EstimatedSiteSource, number> = { staff: 0, mine: 1, public: 2 };
const NODE_RATS: Record<ObservedSite["node"], CellRat | null> = { enb: "lte", gnb: "nr", gsmCell: "gsm", umtsCell: "umts", station: null };
const STATION_SITE_RATS: ReadonlySet<CellRat> = new Set(["gsm", "umts"]);
const NO_FILTER: EstimatedSiteFilter = { operatorIds: [], rats: [], statuses: null };

export function getEstimatedSiteName(site: ObservedSite): string {
  switch (site.node) {
    case "enb":
      return `4G ${site.enbid}`;
    case "gnb":
      return `5G ${site.gnbid}`;
    case "umtsCell":
      return `3G ${site.rnc}:${site.cid}`;
    case "gsmCell":
      return `2G ${site.lac}:${site.cid}`;
    case "station":
      return `#${site.id}`;
  }
}

export function getSiteRat(site: ObservedSite): CellRat | null {
  return NODE_RATS[site.node];
}

export function mergeEstimatedSites(lists: readonly SiteList[]): EstimatedSiteEntry[] {
  const entries = new Map<number, EstimatedSiteEntry>();
  for (const [source, sites] of lists) {
    for (const site of sites ?? []) {
      const known = entries.get(site.id);
      if (known === undefined || SOURCE_RANK[source] < SOURCE_RANK[known.source]) entries.set(site.id, { site, source });
    }
  }
  return [...entries.values()];
}

function listSiteOperatorIds(site: ObservedSite): number[] {
  return site.operatorId === null ? site.guestOperatorIds : [site.operatorId, ...site.guestOperatorIds];
}

function matchesRats(site: ObservedSite, rats: readonly CellRat[]): boolean {
  if (rats.length === 0) return true;
  const siteRat = getSiteRat(site);
  if (siteRat === null) return rats.some((rat) => STATION_SITE_RATS.has(rat));
  return rats.includes(siteRat);
}

function matchesFilter({ site }: EstimatedSiteEntry, { operatorIds, rats, statuses }: EstimatedSiteFilter): boolean {
  if (statuses !== null && site.status !== "replaced" && !statuses.includes(site.status)) return false;
  if (operatorIds.length > 0 && !listSiteOperatorIds(site).some((operatorId) => operatorIds.includes(operatorId))) return false;
  return matchesRats(site, rats);
}

function compareEntries(left: EstimatedSiteEntry, right: EstimatedSiteEntry): number {
  return (left.site.groupId ?? left.site.id) - (right.site.groupId ?? right.site.id) || left.site.id - right.site.id;
}

function describeRing(entries: readonly EstimatedSiteEntry[], lookups: MapLookups | undefined, theme: CrowdTheme): RingLook {
  const isCrossed = entries.every((entry) => entry.site.status === "ignored");
  const operatorIds = entries.flatMap((entry) => listSiteOperatorIds(entry.site));
  const colors = isCrossed ? [MUTED_MARK_COLORS[theme]] : [...new Set(operatorIds.map((operatorId) => getOperatorLook(lookups, operatorId).color))];
  return {
    colors: colors.length > 0 ? colors : [getOperatorLook(lookups, null).color],
    isDashed: entries.some((entry) => !entry.site.isPublic),
    isCrossed,
  };
}

export function listEstimatedSiteMarkers(
  entries: readonly EstimatedSiteEntry[],
  filter: EstimatedSiteFilter,
  lookups: MapLookups | undefined,
  theme: CrowdTheme,
): EstimatedSiteMarker[] {
  const groups = new Map<string, Pick<EstimatedSiteMarker, "key" | "latitude" | "longitude" | "entries">>();
  for (const entry of entries) {
    const { latitude, longitude } = entry.site;
    if (latitude === null || longitude === null || !matchesFilter(entry, filter)) continue;
    const key = `${latitude},${longitude}`;
    const group = groups.get(key) ?? { key, latitude, longitude, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const sorted = group.entries.sort(compareEntries);
    const ring = describeRing(sorted, lookups, theme);
    return { ...group, entries: sorted, ring, ringImageId: getRingImageId(ring) };
  });
}

export function toEstimatedSiteMarker(entry: EstimatedSiteEntry, lookups: MapLookups | undefined, theme: CrowdTheme): EstimatedSiteMarker | null {
  return listEstimatedSiteMarkers([entry], NO_FILTER, lookups, theme).at(0) ?? null;
}

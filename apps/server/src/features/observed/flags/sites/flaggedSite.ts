import type { ObservationFlagKind, ObservedSiteStatus } from "@openbts/shared/contract";
import { calculateDistance } from "@openbts/shared/geo";

import { unique } from "../../../../lib/collections.js";
import type { ObservedSiteRecord, ShownEstimate } from "../../sites/read.js";
import type { Point } from "../../tiles/squares.js";
import type { SiteMeasure } from "../kinds.js";
import { type FlagKey, observedSiteSubject } from "../subjects.js";

const SITE_FLAGS_SETTLED_BY: Readonly<Record<ObservedSiteStatus, readonly ObservationFlagKind[]>> = {
  matched: ["unmatchedSite", "positionShifts", "suggestedSite", "renumbered"],
  ignored: ["unmatchedSite", "positionShifts", "suggestedSite", "renumbered", "positionDiffers"],
  suggested: ["positionDiffers"],
  unmatched: ["positionDiffers"],
  replaced: [],
};

export function metersBetween(from: Point, to: Point): number {
  return calculateDistance(from.latitude, from.longitude, to.latitude, to.longitude);
}

export function toMillionths(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function isFlagSubject(site: ObservedSiteRecord): boolean {
  return site.retiredAt === null && site.copyOfObservedSiteId === null && (site.group === null || site.group.leadSiteId === site.id);
}

export function shownPoint({ snap, estimate }: ObservedSiteRecord): Point | null {
  const point = snap ?? estimate;
  return point === null ? null : { latitude: point.latitude, longitude: point.longitude };
}

export function siteMeasureOf(site: ObservedSiteRecord, estimate: ShownEstimate): SiteMeasure {
  const { latitude, longitude } = site.snap ?? estimate;
  return { people: estimate.personCount, latitude, longitude, radiusMeters: estimate.uncertaintyM };
}

export function membersOf(site: ObservedSiteRecord): number[] {
  return unique([site.id, ...(site.group?.memberSiteIds ?? [])]).toSorted((a, b) => a - b);
}

export function whereShown(site: ObservedSiteRecord) {
  return { observedSiteId: site.id, countryCode: site.countryCode, regionId: site.regionId };
}

export function fixedSiteFlags(sites: readonly ObservedSiteRecord[]): FlagKey[] {
  return sites
    .filter(isFlagSubject)
    .flatMap((site) => SITE_FLAGS_SETTLED_BY[site.status].map((kind) => ({ kind, subjectKey: observedSiteSubject(site) })));
}

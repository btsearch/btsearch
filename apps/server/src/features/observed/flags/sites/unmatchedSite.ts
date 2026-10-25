import { siteEstimates } from "@openbts/drizzle";
import type { StationCreate } from "@openbts/shared/contract";
import { and, eq, inArray } from "drizzle-orm";

import type { DbTx } from "../../../../types/global.js";
import { MIN_SNAP_PROBABILITY } from "../../sites/publicRule.js";
import type { ObservedSiteRecord } from "../../sites/read.js";
import type { RaisedFlag } from "../kinds.js";
import { observedSiteSubject } from "../subjects.js";
import { isFlagSubject, membersOf, siteMeasureOf, whereShown } from "./flaggedSite.js";

export type OwnEstimate = { leaveOutShiftM: number | null; uncertaintyM: number };
export type UnmatchedSiteRules = {
  seenSince: string;
  publicRadiusMaxM: number;
  ownEstimates: ReadonlyMap<number, OwnEstimate>;
  suggestion: StationCreate | null;
};

export function qualifiesAsUnmatched(
  site: ObservedSiteRecord,
  { seenSince, publicRadiusMaxM }: Pick<UnmatchedSiteRules, "seenSince" | "publicRadiusMaxM">,
): boolean {
  const { estimate } = site;
  if (!isFlagSubject(site) || site.stationId !== null || site.status !== "unmatched" || !site.isConfirmed || site.operatorId === null) return false;
  if (estimate === null || !estimate.isConsistent || site.lastSeenOn === null || site.lastSeenOn < seenSince) return false;
  return site.snap === null ? estimate.uncertaintyM <= publicRadiusMaxM : site.snap.probability >= MIN_SNAP_PROBABILITY;
}

export function shiftOf(site: ObservedSiteRecord, ownEstimates: ReadonlyMap<number, OwnEstimate>): { shiftM: number; radiusM: number } | null {
  const shiftsBeyondRadius = (siteId: number) => {
    const estimate = ownEstimates.get(siteId);
    return estimate !== undefined && estimate.leaveOutShiftM !== null && estimate.leaveOutShiftM > estimate.uncertaintyM;
  };
  const own = ownEstimates.get(site.id);
  if (own === undefined || own.leaveOutShiftM === null || !membersOf(site).every(shiftsBeyondRadius)) return null;
  return { shiftM: own.leaveOutShiftM, radiusM: own.uncertaintyM };
}

export function raiseUnmatchedSiteFlag(site: ObservedSiteRecord, rules: UnmatchedSiteRules): RaisedFlag<"unmatchedSite" | "positionShifts"> | null {
  if (!qualifiesAsUnmatched(site, rules) || site.estimate === null) return null;

  const people = site.estimate.personCount;
  const flag = { subjectKey: observedSiteSubject(site), refs: whereShown(site), measure: siteMeasureOf(site, site.estimate) };
  const shift = shiftOf(site, rules.ownEstimates);
  if (shift !== null) {
    const evidence = { observedSiteIds: membersOf(site), people, shiftMeters: shift.shiftM, radiusMeters: shift.radiusM };
    return { kind: "positionShifts", ...flag, evidence, suggestion: null };
  }
  if (rules.suggestion === null) return null;

  const radiusMeters = site.snap === null ? site.estimate.uncertaintyM : null;
  return { kind: "unmatchedSite", ...flag, evidence: { observedSiteIds: membersOf(site), people, radiusMeters }, suggestion: rules.suggestion };
}

export async function loadOwnEstimates(tx: DbTx, siteIds: readonly number[], version: number): Promise<Map<number, OwnEstimate>> {
  if (siteIds.length === 0) return new Map();

  const rows = await tx
    .select({ observedSiteId: siteEstimates.observedSiteId, leaveOutShiftM: siteEstimates.leaveOutShiftM, uncertaintyM: siteEstimates.uncertaintyM })
    .from(siteEstimates)
    .where(and(inArray(siteEstimates.observedSiteId, [...siteIds]), eq(siteEstimates.algorithmVersion, version)));
  return new Map(rows.map(({ observedSiteId, ...estimate }) => [observedSiteId, estimate]));
}

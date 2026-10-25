import { CID_RANGE, OBSERVED_SITE_CONFIDENCE } from "@openbts/shared/contract";
import type { ObservedCellRecord, ObservedSite, ObservedSitePlacement, SnapTarget } from "@openbts/shared/contract";

import type { ObservedSiteRecord, ShownEstimate } from "./read.js";

export type ObservedSiteView = "staff" | "public";

type ObservedSiteIdentity =
  | { node: "enb"; enbid: number }
  | { node: "gnb"; gnbid: number; gnbidLength: number | null }
  | { node: "gsmCell"; lac: number; cid: number }
  | { node: "umtsCell"; rnc: number; cid: number }
  | { node: "station"; stationId: number };

export function snapTargetOf(ids: { locationId: number | null; officialSiteId: number | null; observedSiteId: number | null }): SnapTarget | null {
  if (ids.locationId !== null) return { kind: "location", locationId: ids.locationId };
  if (ids.officialSiteId !== null) return { kind: "officialSite", officialSiteId: ids.officialSiteId };
  if (ids.observedSiteId !== null) return { kind: "observedSite", observedSiteId: ids.observedSiteId };
  return null;
}

function identityOf(site: ObservedSiteRecord): ObservedSiteIdentity {
  const { rat, nodeId, stationId } = site;
  if (stationId !== null) return { node: "station", stationId };
  if (nodeId !== null) {
    if (rat === "LTE") return { node: "enb", enbid: nodeId };
    if (rat === "NR") return { node: "gnb", gnbid: nodeId, gnbidLength: site.gnbidLength };
    if (rat === "GSM") return { node: "gsmCell", lac: Math.floor(nodeId / CID_RANGE), cid: nodeId % CID_RANGE };
    if (rat === "UMTS") return { node: "umtsCell", rnc: Math.floor(nodeId / CID_RANGE), cid: nodeId % CID_RANGE };
  }
  throw new Error(`Observed site ${site.id} has neither a station nor a GSM, UMTS, LTE or NR node`);
}

function toThousandths(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function fitOf(estimate: ShownEstimate): Omit<Extract<ObservedSitePlacement, { kind: "fit" }>, "kind"> {
  return {
    radiusMeters: estimate.uncertaintyM,
    confidence: OBSERVED_SITE_CONFIDENCE,
    ellipse: { majorMeters: estimate.ellipse.majorM, minorMeters: estimate.ellipse.minorM, azimuthDegrees: estimate.ellipse.azimuthDeg },
    alternative: estimate.alternative,
  };
}

function placementOf({ estimate, snap }: ObservedSiteRecord): ObservedSitePlacement | null {
  if (snap === null) return estimate === null ? null : { kind: "fit", ...fitOf(estimate) };

  const probability = toThousandths(snap.probability);
  if (snap.target.kind === "observedSite") return { ...snap.target, probability };
  return { ...snap.target, probability, city: snap.city, address: snap.address };
}

function evidenceOf(estimate: ShownEstimate): NonNullable<ObservedSite["evidence"]> {
  const { sampleCount, taSampleCount } = estimate;
  return {
    samples: sampleCount,
    devices: estimate.contributorCount,
    people: estimate.personCount,
    squares: estimate.binCount,
    timingAdvanceShare: sampleCount === 0 ? 0 : toThousandths(Math.min(1, taSampleCount / sampleCount)),
    angularCoverageDegrees: estimate.angularCoverageDeg,
    distinctDays: estimate.distinctDays,
    maxDistanceMeters: estimate.maxDistanceM,
  };
}

function handLinkFor({ handLink }: ObservedSiteRecord, view: ObservedSiteView): ObservedSite["handLink"] {
  if (handLink === null) return null;
  const at = handLink.at.toISOString();
  return view === "staff" ? { stationId: handLink.stationId, by: handLink.by, at } : { stationId: handLink.stationId, at };
}

function ignoreOf({ ignore }: ObservedSiteRecord): ObservedSite["ignore"] {
  return ignore === null ? null : { reason: ignore.reason, by: ignore.by, at: ignore.at.toISOString() };
}

export function toObservedSite(site: ObservedSiteRecord, cells?: ObservedCellRecord[], view: ObservedSiteView = "staff"): ObservedSite {
  const { estimate, snap } = site;
  const point = snap ?? estimate;
  return {
    id: site.id,
    ...identityOf(site),
    plmns: site.plmns,
    operatorId: site.operatorId,
    guestOperatorIds: site.guestOperatorIds,
    copyOfObservedSiteId: site.copyOfObservedSiteId,
    groupId: site.group?.leadSiteId ?? null,
    countryCode: site.countryCode,
    regionId: site.regionId,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    placement: placementOf(site),
    evidence: estimate === null ? null : evidenceOf(estimate),
    status: site.status,
    matchedStationId: site.matchedStationId,
    suggestedStationId: site.suggestedStationId,
    ...(view === "staff" ? { ignore: ignoreOf(site) } : {}),
    handLink: handLinkFor(site, view),
    replacedByObservedSiteIds: site.status === "replaced" ? site.replacedByObservedSiteIds : [],
    isPublic: site.isPublic,
    notPublicReasons: site.notPublicReasons,
    firstSeenOn: site.firstSeenOn,
    lastSeenOn: site.lastSeenOn,
    estimatedAt: estimate?.estimatedAt.toISOString() ?? null,
    algorithmVersion: site.algorithmVersion,
    ...(cells === undefined ? {} : { cells }),
  };
}

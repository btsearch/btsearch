import type { ObservedSiteRecord, ShownEstimate } from "../../src/features/observed/sites/read.js";

export const BIALYSTOK = { latitude: 53.13251, longitude: 23.16884 };

export function shownEstimate(overrides: Partial<ShownEstimate> = {}): ShownEstimate {
  return {
    of: "site",
    calibrationRunId: 41,
    estimatedAt: new Date("2026-10-24T10:00:00Z"),
    ...BIALYSTOK,
    uncertaintyM: 140,
    ellipse: { majorM: 160, minorM: 90, azimuthDeg: 30 },
    alternative: null,
    isConsistent: true,
    sampleCount: 4200,
    contributorCount: 5,
    personCount: 4,
    binCount: 310,
    taSampleCount: 1500,
    angularCoverageDeg: 220,
    distinctDays: 9,
    maxDistanceM: 3100,
    ...overrides,
  };
}

export function siteRecord(overrides: Partial<ObservedSiteRecord> = {}): ObservedSiteRecord {
  return {
    id: 7310,
    plmn: "26006",
    rat: "LTE",
    nodeId: 24494,
    stationId: null,
    retiredAt: null,
    primarySiteId: overrides.id ?? 7310,
    copyOfObservedSiteId: null,
    group: null,
    estimate: shownEstimate(),
    snap: null,
    status: "unmatched",
    matchedStationId: null,
    suggestedStationId: null,
    isConfirmed: true,
    isPublic: true,
    notPublicReasons: [],
    isCountryShown: true,
    countryCode: "PL",
    regionId: 9,
    algorithmVersion: 1,
    plmns: ["26006"],
    operatorId: 4,
    guestOperatorIds: [],
    gnbidLength: null,
    firstSeenOn: "2026-10-01",
    lastSeenOn: "2026-10-20",
    replacedByObservedSiteIds: [],
    ignore: null,
    handLink: null,
    ...overrides,
  };
}

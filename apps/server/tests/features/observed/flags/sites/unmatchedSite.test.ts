import type { CellApplyNewCell, StationCreate } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { FLAG_KINDS, type RaisedFlag } from "../../../../../src/features/observed/flags/kinds.js";
import { siteMeasureOf } from "../../../../../src/features/observed/flags/sites/flaggedSite.js";
import { type MeasuredCell, suggestStation } from "../../../../../src/features/observed/flags/sites/stationSuggestion.js";
import { type OwnEstimate, type UnmatchedSiteRules, raiseUnmatchedSiteFlag } from "../../../../../src/features/observed/flags/sites/unmatchedSite.js";
import { BIALYSTOK, shownEstimate, siteRecord } from "../../../../helpers/siteRecordFixtures.js";

const SUGGESTED_CELL: CellApplyNewCell = { rat: "lte", bandId: 3, tac: 51010, enbid: 24494, clid: 1, pci: 101, earfcn: 1850, plmns: ["26006"] };
const SUGGESTION: StationCreate = { station: { operatorId: 4 }, location: BIALYSTOK, cells: [SUGGESTED_CELL] };
const MEASURED_CELLS: MeasuredCell[] = [{ cell: SUGGESTED_CELL, bearingDeg: null }];

function rules(overrides: Partial<UnmatchedSiteRules> = {}): UnmatchedSiteRules {
  return { seenSince: "2026-07-27", publicRadiusMaxM: 1000, ownEstimates: new Map(), suggestion: SUGGESTION, ...overrides };
}

describe("unmatchedSite", () => {
  it("opens for a confirmed, consistent and unmatched site seen this month, where the site is shown", () => {
    expect(raiseUnmatchedSiteFlag(siteRecord(), rules())).toEqual({
      kind: "unmatchedSite",
      subjectKey: "observedSite:26006:LTE:24494",
      refs: { observedSiteId: 7310, countryCode: "PL", regionId: 9 },
      evidence: { observedSiteIds: [7310], people: 4, radiusMeters: 140 },
      suggestion: SUGGESTION,
      measure: { people: 4, ...BIALYSTOK, radiusMeters: 140 },
    });
  });

  it.each([
    ["seen four months ago", siteRecord({ lastSeenOn: "2026-06-20" })],
    ["inconsistent", siteRecord({ estimate: shownEstimate({ isConsistent: false }) })],
    ["ignored", siteRecord({ status: "ignored" })],
    ["5 km wide", siteRecord({ estimate: shownEstimate({ uncertaintyM: 5000 }) })],
    ["a copy", siteRecord({ id: 9102, primarySiteId: 9101, copyOfObservedSiteId: 9101 })],
    ["a member that is not the group's lead", siteRecord({ id: 7311, group: { leadSiteId: 7310, memberSiteIds: [7310, 7311] } })],
  ])("does not open for a site %s", (_case, site) => {
    expect(raiseUnmatchedSiteFlag(site, rules())).toBeNull();
  });

  it("opens one flag for a group, on its lead, naming every member", () => {
    const lead = siteRecord({ group: { leadSiteId: 7310, memberSiteIds: [7310, 7311] } });

    expect(raiseUnmatchedSiteFlag(lead, rules())?.evidence.observedSiteIds).toEqual([7310, 7311]);
  });

  it("gives a snapped site no radius and a station on the exact coordinates of our location it snapped to", () => {
    const snap = {
      target: { kind: "location" as const, locationId: 30551 },
      probability: 0.82,
      latitude: 53.1325123456,
      longitude: 23.1688456789,
      city: null,
      address: null,
    };
    const snapped = siteRecord({ snap });
    const suggestion = suggestStation(snapped, MEASURED_CELLS, null);

    expect(raiseUnmatchedSiteFlag(snapped, rules({ suggestion }))?.evidence.radiusMeters).toBeNull();
    expect(suggestion?.location).toEqual({ latitude: 53.1325123456, longitude: 23.1688456789 });
    expect(suggestStation(siteRecord({ estimate: shownEstimate({ latitude: 53.1325123456 }) }), [], "BT33362")?.location?.latitude).toBe(53.132512);
  });

  it("holds a snapped site to the probability of its snap, whatever its fit's radius", () => {
    const snapAt = (probability: number) => ({
      target: { kind: "location" as const, locationId: 30551 },
      probability,
      latitude: 53.1325,
      longitude: 23.1688,
      city: null,
      address: null,
    });

    const sureButWide = siteRecord({ snap: snapAt(0.5), estimate: shownEstimate({ uncertaintyM: 5000 }) });

    expect(raiseUnmatchedSiteFlag(sureButWide, rules())?.kind).toBe("unmatchedSite");
    expect(raiseUnmatchedSiteFlag(siteRecord({ snap: snapAt(0.42) }), rules())).toBeNull();
  });

  it("opens positionShifts instead, without a suggestion, when the estimate moves beyond its radius", () => {
    const shifting = new Map<number, OwnEstimate>([[7310, { leaveOutShiftM: 610, uncertaintyM: 140 }]]);
    const flag = raiseUnmatchedSiteFlag(siteRecord(), rules({ ownEstimates: shifting }));

    expect(flag).toMatchObject({ kind: "positionShifts", evidence: { observedSiteIds: [7310], people: 4, shiftMeters: 610, radiusMeters: 140 } });
    expect(flag?.suggestion).toBeNull();
  });

  it.each([
    ["an empty shift", new Map([[7310, { leaveOutShiftM: null, uncertaintyM: 140 }]])],
    ["a shift within the radius", new Map([[7310, { leaveOutShiftM: 120, uncertaintyM: 140 }]])],
  ])("keeps unmatchedSite for %s", (_case, ownEstimates) => {
    expect(raiseUnmatchedSiteFlag(siteRecord(), rules({ ownEstimates }))?.kind).toBe("unmatchedSite");
  });

  it("raises positionShifts for a group only when every member shifts beyond its own radius", () => {
    const lead = siteRecord({ group: { leadSiteId: 7310, memberSiteIds: [7310, 7311] } });
    const leadShifts = { leaveOutShiftM: 610, uncertaintyM: 140 };
    const steady = new Map<number, OwnEstimate>([
      [7310, leadShifts],
      [7311, { leaveOutShiftM: 90, uncertaintyM: 200 }],
    ]);
    const shifting = new Map<number, OwnEstimate>([
      [7310, leadShifts],
      [7311, { leaveOutShiftM: 450, uncertaintyM: 200 }],
    ]);

    expect(raiseUnmatchedSiteFlag(lead, rules({ ownEstimates: steady }))?.kind).toBe("unmatchedSite");
    expect(raiseUnmatchedSiteFlag(lead, rules({ ownEstimates: shifting }))?.kind).toBe("positionShifts");
  });

  it("opens again after a dismissal only once more people measured it or it moved beyond its radius, never on more samples alone", () => {
    const dismissed = { measure: siteMeasureOf(siteRecord(), shownEstimate()) };
    const raisedWith = (estimate: Parameters<typeof shownEstimate>[0]) =>
      raiseUnmatchedSiteFlag(siteRecord({ estimate: shownEstimate(estimate) }), rules()) as RaisedFlag<"unmatchedSite">;

    expect(FLAG_KINDS.unmatchedSite.isWorthRaisingAgain(dismissed, raisedWith({ sampleCount: 42_000 }))).toBe(false);
    expect(FLAG_KINDS.unmatchedSite.isWorthRaisingAgain(dismissed, raisedWith({ latitude: BIALYSTOK.latitude + 0.001 }))).toBe(false);
    expect(FLAG_KINDS.unmatchedSite.isWorthRaisingAgain(dismissed, raisedWith({ personCount: 5 }))).toBe(true);
    expect(FLAG_KINDS.unmatchedSite.isWorthRaisingAgain(dismissed, raisedWith({ latitude: BIALYSTOK.latitude + 0.002 }))).toBe(true);
  });
});

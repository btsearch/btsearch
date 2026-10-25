import { describe, expect, it } from "vitest";

import { type SuccessionFlag, planCarriedDismissals, planFlagMoves } from "../../../../../src/features/observed/flags/sites/flagMoves.js";

describe("a group whose lead changes", () => {
  it("moves the open flag of the old lead to a new lead that has none, and resolves it when the new lead has one", () => {
    const flags = [{ id: 3301, kind: "unmatchedSite", subjectKey: "site:7310", closedReason: null }];
    const move = { fromSubjectKey: "site:7310", toSubjectKey: "site:7305", observedSiteId: 7305 };

    expect(planFlagMoves(flags, [move])).toEqual({ resolvedIds: [], rewrites: [{ id: 3301, subjectKey: "site:7305", observedSiteId: 7305 }] });
    expect(planFlagMoves([...flags, { id: 3350, kind: "unmatchedSite", subjectKey: "site:7305", closedReason: null }], [move])).toEqual({
      resolvedIds: [3301],
      rewrites: [],
    });
  });

  it("moves a dismissal too, so the new lead keeps it closed", () => {
    const flags = [{ id: 3301, kind: "unmatchedSite", subjectKey: "site:7310", closedReason: "dismissed" as const }];
    const move = { fromSubjectKey: "site:7310", toSubjectKey: "site:7305", observedSiteId: 7305 };

    expect(planFlagMoves(flags, [move]).rewrites).toEqual([{ id: 3301, subjectKey: "site:7305", observedSiteId: 7305 }]);
  });
});

describe("a site that a re-cut retires", () => {
  const successorKeys = new Map([
    [7411, "site:7411"],
    [7412, "site:7412"],
  ]);
  const successions = [
    { observedSiteId: 7310, replacedBySiteId: 7411 },
    { observedSiteId: 7310, replacedBySiteId: 7412 },
  ];

  function flag(id: number, overrides: Partial<SuccessionFlag> = {}): SuccessionFlag {
    return {
      id,
      kind: "unmatchedSite",
      subjectKey: "site:7310",
      observedSiteId: 7310,
      closedReason: "dismissed",
      resolvedAt: new Date("2026-10-20T10:00:00Z"),
      ...overrides,
    };
  }

  it("carries its dismissal to each successor under the successor's key, unless the successor holds a flag of that kind", () => {
    expect(planCarriedDismissals([flag(3301)], successions, successorKeys, [{ kind: "unmatchedSite", subjectKey: "site:7412" }])).toEqual([
      { ...flag(3301), subjectKey: "site:7411", observedSiteId: 7411 },
    ]);
  });

  it("carries only a kind whose latest flag is a dismissal", () => {
    const flags = [
      flag(3301),
      flag(3302, { kind: "positionShifts" }),
      flag(3303, { kind: "positionShifts", closedReason: null, resolvedAt: null }),
      flag(3304, { kind: "renumbered" }),
      flag(3305, { kind: "renumbered", closedReason: "evidenceGone", resolvedAt: new Date("2026-10-22T10:00:00Z") }),
    ];

    expect(planCarriedDismissals(flags, successions.slice(0, 1), successorKeys, []).map((carried) => carried.id)).toEqual([3301]);
  });

  it("gives a successor of several retired sites the dismissal of the first of them by id", () => {
    const merged = [
      { observedSiteId: 7320, replacedBySiteId: 7411 },
      { observedSiteId: 7310, replacedBySiteId: 7411 },
    ];
    const flags = [flag(3301), flag(3302, { subjectKey: "site:7320", observedSiteId: 7320 })];

    expect(planCarriedDismissals(flags, merged, successorKeys, []).map((carried) => carried.id)).toEqual([3301]);
  });
});

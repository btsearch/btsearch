import { describe, expect, it } from "vitest";

import { decideSlice } from "../../../../src/features/official/import/guard.js";

const UNAPPROVED_AT_20_PERCENT = { holdShrinkPercent: 20, isApproved: false };

describe("the guard of a slice", () => {
  it.each([
    { stagedCount: 100, liveCount: 100, outcome: "applied" },
    { stagedCount: 80, liveCount: 100, outcome: "applied" },
    { stagedCount: 79, liveCount: 100, outcome: "held" },
    { stagedCount: 150, liveCount: 100, outcome: "applied" },
    { stagedCount: 1, liveCount: 0, outcome: "applied" },
    { stagedCount: 0, liveCount: 0, outcome: "held" },
    { stagedCount: 0, liveCount: 5, outcome: "held" },
    { stagedCount: 4, liveCount: 5, outcome: "applied" },
    { stagedCount: 3, liveCount: 5, outcome: "held" },
  ])("staged $stagedCount against live $liveCount is $outcome at 20%", ({ stagedCount, liveCount, outcome }) => {
    expect(decideSlice({ ...UNAPPROVED_AT_20_PERCENT, stagedCount, liveCount })).toBe(outcome);
  });

  it("follows the dataset's own threshold", () => {
    expect(decideSlice({ stagedCount: 51, liveCount: 100, holdShrinkPercent: 50, isApproved: false })).toBe("applied");
    expect(decideSlice({ stagedCount: 49, liveCount: 100, holdShrinkPercent: 50, isApproved: false })).toBe("held");
    expect(decideSlice({ stagedCount: 99, liveCount: 100, holdShrinkPercent: 0, isApproved: false })).toBe("held");
    expect(decideSlice({ stagedCount: 1, liveCount: 100, holdShrinkPercent: 100, isApproved: false })).toBe("applied");
  });

  it("applies an approved slice whatever its counts are", () => {
    expect(decideSlice({ stagedCount: 0, liveCount: 100, holdShrinkPercent: 20, isApproved: true })).toBe("applied");
    expect(decideSlice({ stagedCount: 10, liveCount: 100, holdShrinkPercent: 20, isApproved: true })).toBe("applied");
  });
});

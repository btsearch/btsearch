import { describe, expect, it } from "vitest";

import { fixedSiteFlags } from "../../../../../src/features/observed/flags/sites/flaggedSite.js";
import { siteRecord } from "../../../../helpers/siteRecordFixtures.js";

describe("the flags a site's status settles", () => {
  it("counts a lead an editor matched or ignored as settled, and a copy or a site that only stopped qualifying as not", () => {
    const key = "observedSite:26006:LTE:24494";

    expect(fixedSiteFlags([siteRecord({ status: "matched", matchedStationId: 40122 })])).toEqual([
      { kind: "unmatchedSite", subjectKey: key },
      { kind: "positionShifts", subjectKey: key },
      { kind: "suggestedSite", subjectKey: key },
      { kind: "renumbered", subjectKey: key },
    ]);
    expect(fixedSiteFlags([siteRecord({ status: "ignored" })]).map((flag) => flag.kind)).toContain("unmatchedSite");
    expect(fixedSiteFlags([siteRecord({ status: "matched", copyOfObservedSiteId: 7300 })])).toEqual([]);
    expect(fixedSiteFlags([siteRecord({ lastSeenOn: "2026-06-20" })]).map((flag) => flag.kind)).not.toContain("unmatchedSite");
  });
});

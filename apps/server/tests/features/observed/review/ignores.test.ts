import { describe, expect, it } from "vitest";

import { staleIgnoreIds } from "../../../../src/features/observed/review/ignores.js";
import type { ObservedSiteRecord } from "../../../../src/features/observed/sites/read.js";
import { BIALYSTOK, shownEstimate, siteRecord } from "../../../helpers/siteRecordFixtures.js";

describe("an ignore", () => {
  const ignored: ObservedSiteRecord = siteRecord({ status: "ignored" });
  const stored = (observedSiteId: number, observedCellIds: number[]) => ({ observedSiteId, observedCellIds, point: BIALYSTOK, uncertaintyM: 60 });
  const cell = (id: number, observedSiteId: number) => ({ id, observedSiteId });

  it("lifts when the site gets a cell it was not ignored with", () => {
    expect(staleIgnoreIds(ignored, [stored(7310, [50911])], [cell(50911, 7310), cell(50944, 7310)])).toEqual([7310]);
  });

  it("lifts when the site is shown farther away than its radius then, and not within it", () => {
    const movedBy = (degrees: number) => siteRecord({ status: "ignored", estimate: shownEstimate({ latitude: BIALYSTOK.latitude + degrees }) });

    expect(staleIgnoreIds(movedBy(0.001), [stored(7310, [50911])], [cell(50911, 7310)])).toEqual([7310]);
    expect(staleIgnoreIds(movedBy(0.0004), [stored(7310, [50911])], [cell(50911, 7310)])).toEqual([]);
  });

  describe("of a group", () => {
    const group = (memberSiteIds: number[], overrides: Partial<ObservedSiteRecord> = {}) => {
      const [leadSiteId = 7310] = memberSiteIds;
      return siteRecord({ id: leadSiteId, status: "ignored", group: { leadSiteId, memberSiteIds }, ...overrides });
    };
    const ignores = [stored(7310, [50911]), stored(7311, [50912])];

    it("stays while every member has only the cells it was ignored with, and leaves other sites' ignores alone", () => {
      const cells = [cell(50911, 7310), cell(50912, 7311), cell(60001, 7400)];

      expect(staleIgnoreIds(group([7310, 7311]), [...ignores, stored(7400, [])], cells)).toEqual([]);
    });

    it("lifts every member's ignore together when another member gets a new cell", () => {
      const cells = [cell(50911, 7310), cell(50912, 7311), cell(50944, 7311)];

      expect(staleIgnoreIds(group([7310, 7311]), ignores, cells)).toEqual([7310, 7311]);
    });

    it("lifts every member's ignore together when the group moves beyond the radius", () => {
      const moved = group([7310, 7311], { estimate: shownEstimate({ latitude: BIALYSTOK.latitude + 0.001 }) });

      expect(staleIgnoreIds(moved, ignores, [cell(50911, 7310), cell(50912, 7311)])).toEqual([7310, 7311]);
    });

    it("lifts the members' ignores when the group gains a member that was never ignored", () => {
      const cells = [cell(50900, 7305), cell(50911, 7310), cell(50912, 7311)];

      expect(staleIgnoreIds(group([7305, 7310, 7311], { status: "unmatched" }), ignores, cells)).toEqual([7310, 7311]);
    });
  });
});

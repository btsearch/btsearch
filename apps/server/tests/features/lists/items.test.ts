import { describe, expect, it } from "vitest";

import { applyItemChanges, itemsNotStored } from "../../../src/features/lists/items.js";

describe("applyItemChanges", () => {
  it("preserves existing membership when no changes are sent", () => {
    expect(applyItemChanges([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("removes members, ignores absent removals and appends new members once", () => {
    expect(applyItemChanges([1, 2, 2, 3], [3, 4, 4], [2, 9])).toEqual([1, 3, 4]);
  });

  it("handles empty membership and clears every member", () => {
    expect(applyItemChanges([])).toEqual([]);
    expect(applyItemChanges([1, 2], [], [1, 2])).toEqual([]);
  });

  it("does not mutate the caller's arrays", () => {
    const current = Object.freeze([1, 2]);
    const added = Object.freeze([3]);
    const removed = Object.freeze([1]);
    expect(applyItemChanges(current, added, removed)).toEqual([2, 3]);
    expect(current).toEqual([1, 2]);
  });
});

describe("itemsNotStored", () => {
  it("validates only newly introduced ids in each independent item kind", () => {
    expect(
      itemsNotStored({ stationIds: [1, 2], officialSiteIds: [1, 2], microwaveLinkIds: [1, 2] }, { internal: [1], uke: [2], radiolines: [] }),
    ).toEqual({ stationIds: [2], officialSiteIds: [1], microwaveLinkIds: [1, 2] });
  });

  it("distinguishes omitted item kinds from an explicitly empty replacement", () => {
    expect(itemsNotStored({ stationIds: [] }, { internal: [1], uke: [2], radiolines: [3] })).toEqual({
      stationIds: [],
      officialSiteIds: undefined,
      microwaveLinkIds: undefined,
    });
  });
});

import { describe, expect, it } from "vitest";

import { registerNumberOf } from "../../../../../src/features/observed/flags/sites/registerNumbers.js";

describe("the register's number for a site", () => {
  it("is named only when exactly one free number is named for the operator", () => {
    const link = { observedSiteId: 7310, officialSiteId: 55120, operatorId: 4, siteId: "BT33362", isTaken: false };

    expect(registerNumberOf([link], 4)).toEqual({ siteId: "BT33362", officialSiteId: 55120 });
    expect(registerNumberOf([link, { ...link, officialSiteId: 55121, siteId: "BT33363" }], 4)).toBeNull();
    expect(registerNumberOf([{ ...link, isTaken: true }], 4)).toBeNull();
    expect(registerNumberOf([link], 2)).toBeNull();
  });
});

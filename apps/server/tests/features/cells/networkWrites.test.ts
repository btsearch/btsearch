import { describe, expect, it } from "vitest";

import { type KnownPlmns, type NetworkOwner, extraCodesFromSent } from "../../../src/features/cells/networkWrites.js";

const vodafone: NetworkOwner = { operatorId: 1, mainCode: "23415", countryCode: "GB" };
const known: KnownPlmns = new Map([
  ["23415", { id: 1, code: "23415", countryCode: "GB" }],
  ["23420", { id: 2, code: "23420", countryCode: "GB" }],
  ["23410", { id: 3, code: "23410", countryCode: "GB" }],
  ["26201", { id: 4, code: "26201", countryCode: "DE" }],
]);

describe("extraCodesFromSent", () => {
  it("drops the owner's main code and keeps the rest", () => {
    expect(extraCodesFromSent("LTE", ["23420", "23415"], vodafone, known)).toEqual(["23420"]);
  });

  it("refuses an unknown code", () => {
    expect(() => extraCodesFromSent("LTE", ["23415", "23499"], vodafone, known)).toThrow("Network code 23499 does not exist");
  });

  it("refuses a code of another country", () => {
    expect(() => extraCodesFromSent("LTE", ["23415", "26201"], vodafone, known)).toThrow("Network code 26201 belongs to another country");
  });

  it("refuses a list without the owner's main code", () => {
    expect(() => extraCodesFromSent("LTE", ["23420"], vodafone, known)).toThrow("must include the station owner's main code 23415");
  });

  it("accepts a list of extra codes only when the owner has no main code", () => {
    const neutralHost: NetworkOwner = { operatorId: 9, mainCode: null, countryCode: "GB" };
    expect(extraCodesFromSent("LTE", ["23420", "23410"], neutralHost, known)).toEqual(["23410", "23420"]);
  });

  it("refuses extra codes on a GSM cell", () => {
    expect(() => extraCodesFromSent("GSM", ["23415", "23420"], vodafone, known)).toThrow("This cell cannot broadcast other networks");
  });

  it("caps the extra codes per technology", () => {
    const many = Array.from({ length: 6 }, (_, index) => `2349${index}`);
    const codes: KnownPlmns = new Map([...known, ...many.map((code, index) => [code, { id: 10 + index, code, countryCode: "GB" }] as const)]);
    expect(() => extraCodesFromSent("LTE", ["23415", ...many], vodafone, codes)).toThrow("at most 5 networks");
    expect(extraCodesFromSent("NR", ["23415", ...many], vodafone, codes)).toHaveLength(6);
  });
});

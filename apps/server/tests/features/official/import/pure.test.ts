import type { Release, SiteRecord } from "@openbts/country-packs/sources";
import { describe, expect, it } from "vitest";

import { assertReleasesAreDisjoint } from "../../../../src/features/official/import/datasets.js";
import { type ListedFile, isListedUnchanged, releaseHashOf } from "../../../../src/features/official/import/download.js";
import { fileDateOf } from "../../../../src/features/official/import/fileDate.js";
import { describeUnseenLicensees, licenseeNameCorrections, matchUnseenLicensees } from "../../../../src/features/official/import/licensees.js";
import { type MoveCandidate, decideSiteMoves } from "../../../../src/features/official/import/sites/lineage.js";
import { siteRecordProblem, unmappedNamesOf } from "../../../../src/features/official/import/sites/staging.js";
import { type SkipCounts, countSkip, skipRows } from "../../../../src/features/official/import/skips.js";

const RUN_STARTED_AT = new Date("2026-10-12T14:15:16.789Z");

function siteRecord(overrides: { siteId?: string; number?: string; mhz?: number; rat?: string } = {}): SiteRecord {
  return {
    slice: "LTE:800:commercial",
    location: { longitude: 21.0123, latitude: 52.2297, city: "Warszawa", address: null, regionIsoCode: "PL-14" },
    site: { siteId: overrides.siteId ?? "BT1001", licensee: "Orange Polska S.A.", name: null },
    permit: {
      label: { rat: (overrides.rat ?? "LTE") as SiteRecord["permit"]["label"]["rat"], mhz: overrides.mhz ?? 800, variant: "commercial" },
      number: overrides.number ?? "DZC/1",
      decisionType: "permit_change",
      expiresOn: "2030-01-01",
    },
    sectors: [{ azimuth: 120, elevation: null, antennaHeight: 30.5, antennaPlacement: "outdoor" }],
  };
}

describe("the file's date", () => {
  it("takes the day the release was published and the time of day the run started", () => {
    expect(fileDateOf("2026-10-01", RUN_STARTED_AT).toISOString()).toBe("2026-10-01T14:15:16.789Z");
    expect(fileDateOf("2024-02-29", new Date("2026-10-12T23:59:59.999Z")).toISOString()).toBe("2024-02-29T23:59:59.999Z");
  });

  it("is the moment the run started when the release has no date", () => {
    expect(fileDateOf(null, RUN_STARTED_AT)).toEqual(RUN_STARTED_AT);
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    expect(() => fileDateOf("01.10.2026", RUN_STARTED_AT)).toThrow('"01.10.2026" is not a YYYY-MM-DD date');
  });
});

describe("the release hash", () => {
  it("depends on the files' hashes and their order", () => {
    const first = "a".repeat(64);
    const second = "b".repeat(64);

    expect(releaseHashOf([first, second])).toMatch(/^[0-9a-f]{64}$/);
    expect(releaseHashOf([first, second])).toBe(releaseHashOf([first, second]));
    expect(releaseHashOf([first, second])).not.toBe(releaseHashOf([second, first]));
    expect(releaseHashOf([first])).not.toBe(first);
  });
});

describe("a listed file", () => {
  const file = { url: "https://files.invalid/2026-10-01_lte800.xlsx", fileName: "2026-10-01_lte800.xlsx" };
  const head = { sizeBytes: 1200, etag: '"abc"', lastModified: new Date("2026-10-01T08:00:00.000Z") };
  const listed: ListedFile = {
    sourceId: 1,
    url: file.url,
    fileName: file.fileName,
    sizeBytes: 1200,
    publishedOn: "2026-10-01",
    etag: '"abc"',
    lastModified: new Date("2026-10-01T08:00:00.000Z"),
    fileSha256: "c".repeat(64),
    checkedAt: new Date("2026-10-10T00:00:00.000Z"),
  };
  const now = new Date("2026-10-12T00:00:00.000Z");

  it("is unchanged while the publisher lists it as at its last download", () => {
    expect(isListedUnchanged(listed, file, "2026-10-01", head, now)).toBe(true);
  });

  it.each([
    ["was never downloaded", undefined, file, "2026-10-01", head, now],
    ["has another name", listed, { ...file, fileName: "2026-10-02_lte800.xlsx" }, "2026-10-01", head, now],
    ["has another date", listed, file, "2026-10-02", head, now],
    ["has another size", listed, file, "2026-10-01", { ...head, sizeBytes: 1201 }, now],
    ["has another ETag", listed, file, "2026-10-01", { ...head, etag: '"abd"' }, now],
    ["was modified since", listed, file, "2026-10-01", { ...head, lastModified: new Date("2026-10-02T08:00:00.000Z") }, now],
    ["lost its Last-Modified", listed, file, "2026-10-01", { ...head, lastModified: null }, now],
    ["could not be asked about", listed, file, "2026-10-01", null, now],
    ["was last downloaded more than a week ago", listed, file, "2026-10-01", head, new Date("2026-10-17T00:00:00.001Z")],
  ])("is downloaded again when it %s", (_reason, listedFile, listedAs, publishedOn, answer, at) => {
    expect(isListedUnchanged(listedFile, listedAs, publishedOn, answer, at)).toBe(false);
  });
});

describe("the releases of one dataset", () => {
  const release = (...coveredSlices: string[]): Release => ({
    coveredSlices,
    files: [{ url: "https://files.invalid/a.xlsx", fileName: "a.xlsx" }],
    publishedOn: null,
  });

  it("may each cover their own slices", () => {
    const releases = [release("LTE:800:commercial"), release("GSM:900:commercial", "GSM:900:railway")];

    expect(() => assertReleasesAreDisjoint("permits", releases)).not.toThrow();
  });

  it("fail the dataset when two of them cover one slice", () => {
    expect(() => assertReleasesAreDisjoint("permits", [release("LTE:800:commercial"), release("LTE:800:commercial")])).toThrow(
      'Two releases of permits cover the slice "LTE:800:commercial"',
    );
  });

  it("fail the dataset when one covers nothing or lists no file", () => {
    expect(() => assertReleasesAreDisjoint("permits", [release()])).toThrow("covers no slice or lists no file");
    expect(() => assertReleasesAreDisjoint("permits", [{ ...release(""), files: [] }])).toThrow("covers no slice or lists no file");
  });
});

describe("skip counts", () => {
  it("add up per slice and reason", () => {
    const counts: SkipCounts = new Map();
    countSkip(counts, "orange", "bad_coordinates");
    countSkip(counts, "orange", "bad_coordinates");
    countSkip(counts, "orange", "unknown_region", 5);
    countSkip(counts, "p4", "unknown_region", 0);

    expect(skipRows(counts, ["orange", "p4"])).toEqual([
      { slice: "orange", reason: "bad_coordinates", recordCount: 2 },
      { slice: "orange", reason: "unknown_region", recordCount: 5 },
    ]);
  });

  it("refuse a slice the release does not cover", () => {
    const counts: SkipCounts = new Map();
    countSkip(counts, "t-mobile", "bad_coordinates");

    expect(() => skipRows(counts, ["orange"])).toThrow('Records were skipped for the slice "t-mobile"');
  });
});

describe("a site record", () => {
  it.each([{}, { siteId: "X".repeat(16), number: "D".repeat(100) }])("is staged when its site code and decision number fit", (overrides) => {
    expect(siteRecordProblem(siteRecord(overrides))).toBeNull();
  });

  it.each([
    ["site_id_too_long", { siteId: "X".repeat(17) }],
    ["decision_number_too_long", { number: "D".repeat(101) }],
    ["bad_label", { mhz: 0 }],
    ["bad_label", { mhz: -800 }],
    ["bad_label", { mhz: 800.5 }],
    ["bad_label", { rat: "WIMAX" }],
  ])("is skipped as %s", (problem, overrides) => {
    expect(siteRecordProblem(siteRecord(overrides))).toBe(problem);
  });

  it("counts characters, not UTF-16 units, as the columns do", () => {
    expect(siteRecordProblem(siteRecord({ siteId: "𝔹".repeat(16) }))).toBeNull();
  });
});

describe("the move of a site", () => {
  const candidate = (overrides: Partial<MoveCandidate>): MoveCandidate => ({
    siteCode: "BT1001",
    operatorId: 4,
    locationId: 20,
    firstOrdinal: 0,
    slice: "orange",
    officialSiteId: 500,
    fromLocationId: 10,
    ...overrides,
  });

  it("happens when the source has exactly one site of that operator and code", () => {
    expect(decideSiteMoves([candidate({})])).toEqual([
      { officialSiteId: 500, siteCode: "BT1001", operatorId: 4, fromLocationId: 10, toLocationId: 20, slice: "orange" },
    ]);
  });

  it("ends at the tuple the file names last, and is one move", () => {
    const moves = decideSiteMoves([
      candidate({ locationId: 20, firstOrdinal: 3 }),
      candidate({ locationId: 30, firstOrdinal: 9, slice: "p4" }),
      candidate({ locationId: 40, firstOrdinal: 5 }),
    ]);

    expect(moves).toEqual([{ officialSiteId: 500, siteCode: "BT1001", operatorId: 4, fromLocationId: 10, toLocationId: 30, slice: "p4" }]);
  });

  it("does not happen when the pair has several sites", () => {
    expect(decideSiteMoves([candidate({ officialSiteId: 500 }), candidate({ officialSiteId: 501, fromLocationId: 11 })])).toEqual([]);
  });

  it("is decided per operator and site code", () => {
    const moves = decideSiteMoves([
      candidate({}),
      candidate({ operatorId: 5, officialSiteId: 600, fromLocationId: 11, locationId: 21 }),
      candidate({ siteCode: "BT1002", officialSiteId: 700 }),
      candidate({ siteCode: "BT1002", officialSiteId: 701 }),
    ]);

    expect(moves.map((move) => [move.operatorId, move.siteCode, move.officialSiteId, move.toLocationId])).toEqual([
      [4, "BT1001", 500, 20],
      [5, "BT1001", 600, 21],
    ]);
  });
});

describe("licensees", () => {
  const rules = {
    shortLicenseeName: (name: string) => name.replace(/ S\.A\.$|^S\.A\.$/, ""),
    operatorNameOfLicensee: (name: string) => (name.startsWith("Orange") ? "Orange" : null),
  };

  it("are described by the source's own rules when first seen", () => {
    expect(describeUnseenLicensees(["Orange Polska S.A.", "SATFILM S.A.", "S.A."], rules)).toEqual([
      { legalName: "Orange Polska S.A.", name: "Orange Polska", operatorName: "Orange" },
      { legalName: "SATFILM S.A.", name: "SATFILM", operatorName: null },
    ]);
  });

  describe("that no stored legal name matches", () => {
    const unseen = (legalName: string) => ({ legalName, name: rules.shortLicenseeName(legalName), operatorName: null });

    it("get a new row while the stored short name is still the uncorrected one", () => {
      const uncorrected = { id: 3, name: "TFILM", operatorId: null };

      expect(matchUnseenLicensees([unseen("SATFILM")], [uncorrected]).added).toEqual([unseen("SATFILM")]);
    });
  });

  it("get their short name corrected where the stored one differs", () => {
    const stored = [
      { id: 1, name: "TFILM", legalName: "SATFILM S.A." },
      { id: 2, name: "Orange Polska", legalName: "Orange Polska S.A." },
      { id: 3, name: "kept", legalName: "S.A." },
    ];

    expect(licenseeNameCorrections(stored, rules.shortLicenseeName)).toEqual([{ id: 1, name: "SATFILM" }]);
  });

  it("leave a site's published name unmapped when it resolved to no licensee or to one without an operator", () => {
    const resolved = new Map([
      ["Orange Polska S.A.", { licenseeId: 8, operatorId: 4 }],
      ["SATFILM S.A.", { licenseeId: 9, operatorId: null }],
    ]);

    expect(unmappedNamesOf(["Orange Polska S.A.", "S.A.", "SATFILM S.A."], resolved)).toEqual(["S.A.", "SATFILM S.A."]);
  });
});

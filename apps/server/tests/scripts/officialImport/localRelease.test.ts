import type { OfficialSourceDefinition, ReadContext, Release } from "@openbts/country-packs/sources";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { localReleaseOf, publishedOnOf, withLocalRelease } from "../../../src/scripts/officialImport/localRelease.js";

const publishedReleases: Release[] = [
  { coveredSlices: ["north"], files: [{ url: "https://files.invalid/north.xlsx", fileName: "north.xlsx" }], publishedOn: null },
];

const source = {
  key: "test-source",
  datasets: [
    { key: "towers", layer: "sites", permitKind: "permit", checkEveryHours: 6, discover: async () => publishedReleases },
    { key: "links", layer: "microwave_links", permitKind: "permit", checkEveryHours: 24, discover: async () => publishedReleases },
  ],
} as unknown as OfficialSourceDefinition;

describe("the publication date in a file name", () => {
  it.each<[string, string | null]>([
    ["2026-10-01_orange.xlsx", "2026-10-01"],
    ["wykaz_2024-02-29.xlsx", "2024-02-29"],
    ["2026-10-01_to_2026-10-08.xlsx", "2026-10-01"],
    ["orange.xlsx", null],
    ["20261001_orange.xlsx", null],
    ["2026-13-01_orange.xlsx", null],
    ["2026-02-30_orange.xlsx", null],
  ])("%s -> %s", (fileName, expected) => {
    expect(publishedOnOf(fileName)).toBe(expected);
  });
});

describe("the release built for --file", () => {
  it.each<[string, string, string | null]>([
    ["downloads/2026-10-01_orange.xlsx", "orange", "2026-10-01"],
    [path.resolve("downloads", "links.xlsx"), "", null],
  ])("%s as slice %j", (filePath, slice, publishedOn) => {
    const absolutePath = path.resolve(filePath);

    expect(localReleaseOf(filePath, slice)).toEqual({
      coveredSlices: [slice],
      files: [{ url: pathToFileURL(absolutePath).href, fileName: path.basename(filePath), path: absolutePath }],
      publishedOn,
    });
  });

  it("is what the named dataset discovers, and the other datasets still discover their own", async () => {
    const release = localReleaseOf("downloads/2026-10-01_north.xlsx", "north");
    const context = {} as ReadContext;

    const [towers, links] = withLocalRelease(source, "towers", release).datasets;

    expect(await towers?.discover(context)).toEqual([release]);
    expect(await links?.discover(context)).toBe(publishedReleases);
    expect(towers).toMatchObject({ key: "towers", layer: "sites", checkEveryHours: 6 });
    expect(await source.datasets[0]?.discover(context)).toBe(publishedReleases);
  });
});

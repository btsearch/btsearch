import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/official/sources/index.js";
import { cacheInRedis, dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import {
  SOURCE_VISIBILITY_KEY,
  cacheCountryVisibility,
  scriptAdminVisibility,
  scriptGuestVisibility,
} from "../../../../../helpers/officialDataFixtures.js";
import { RELEASE_SHA256, datasetRow, signInAs, sourceRow } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/sources" };
const linksDataset = {
  ...datasetRow,
  id: 12,
  key: "microwave-links",
  layer: "microwave_links",
  isEnabled: false,
  holdShrinkPercent: 35,
  nextCheckAt: null,
};

const slices = [
  { datasetId: 11, key: "LTE:800:commercial", importedAt: new Date("2026-10-10T06:00:00.000Z"), releaseSha256: RELEASE_SHA256 },
  { datasetId: 11, key: "NR:3500:commercial", importedAt: new Date("2026-10-11T06:00:00.000Z"), releaseSha256: null },
  { datasetId: 12, key: "", importedAt: null, releaseSha256: null },
];

const publicSource = {
  key: "test-register",
  countryCode: "PL",
  shortName: "REG",
  authority: "Test Register Authority",
  homepageUrl: "https://register.invalid",
  license: "CC BY 4.0",
  attribution: "Source: Test Register Authority",
  coverageNote: null,
  isVisible: true,
  datasets: [
    { id: 11, sourceKey: "test-register", key: "permits", layer: "sites", importedAt: "2026-10-11T06:00:00.000Z" },
    { id: 12, sourceKey: "test-register", key: "microwave-links", layer: "microwaveLinks", importedAt: null },
  ],
};

const hiddenCountrySource = { ...sourceRow, id: 2, key: "xx-register", countryCode: "XX" };
const switchedOffSource = { ...sourceRow, id: 3, key: "switched-off", isVisible: false };

function cacheSources(hiddenCountryCodes: string[] = []) {
  cacheCountryVisibility(hiddenCountryCodes);
  cacheInRedis(
    SOURCE_VISIBILITY_KEY,
    [sourceRow, hiddenCountrySource, switchedOffSource].map(({ id, countryCode, isVisible }) => ({ id, countryCode, isVisible })),
  );
}

describe("GET /official/sources", () => {
  it("returns every source with its datasets, their switches and the last import of each slice", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.sources", [sourceRow]);
    dbMock.enqueueFor("select", "official.datasets", [datasetRow, linksDataset]);
    dbMock.enqueueFor("select", "official.dataset_slices", slices);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          key: "test-register",
          countryCode: "PL",
          shortName: "REG",
          authority: "Test Register Authority",
          homepageUrl: "https://register.invalid",
          license: "CC BY 4.0",
          attribution: "Source: Test Register Authority",
          coverageNote: null,
          isVisible: true,
          isEnabled: true,
          isRedistributable: true,
          datasets: [
            {
              id: 11,
              sourceKey: "test-register",
              key: "permits",
              layer: "sites",
              importedAt: "2026-10-11T06:00:00.000Z",
              isEnabled: true,
              checkEveryHours: 6,
              nextCheckAt: "2026-10-12T12:00:00.000Z",
              holdShrinkPercent: null,
              defaultHoldShrinkPercent: 20,
              slices: [
                { key: "LTE:800:commercial", importedAt: "2026-10-10T06:00:00.000Z", releaseSha256: RELEASE_SHA256 },
                { key: "NR:3500:commercial", importedAt: "2026-10-11T06:00:00.000Z", releaseSha256: null },
              ],
            },
            {
              id: 12,
              sourceKey: "test-register",
              key: "microwave-links",
              layer: "microwaveLinks",
              importedAt: null,
              isEnabled: false,
              checkEveryHours: 6,
              nextCheckAt: null,
              holdShrinkPercent: 35,
              defaultHoldShrinkPercent: 20,
              slices: [{ key: "", importedAt: null, releaseSha256: null }],
            },
          ],
        },
      ],
    });
    expect(whereQuery.bind(null, "official.sources", "select")).toThrow("No where condition");
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("answers an empty list without asking for datasets when no source is stored", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.sources", []);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.map((call) => call.table)).toEqual(["official.sources"]);
  });

  it.each([
    ["guest", ["XX"], [publicSource]],
    ["editor", [], [publicSource, { ...publicSource, key: "xx-register", countryCode: "XX", datasets: [] }]],
  ] as const)("gives a %s the visible sources of the countries it can see, without the fields for administrators", async (viewer, hidden, served) => {
    cacheSources([...hidden]);
    dbMock.enqueueFor("select", "official.sources", [switchedOffSource, sourceRow, hiddenCountrySource]);
    dbMock.enqueueFor("select", "official.datasets", [datasetRow, linksDataset]);
    dbMock.enqueueFor("select", "official.dataset_slices", slices);
    const response = await injectMutation(route, request, viewer === "guest" ? { runAuth: true } : signInAs(viewer));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: served });
    expect(whereQuery("official.datasets", "select").params).toEqual(served.length === 1 ? [1] : [1, 2]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("narrows the visible sources to the countries asked for", async () => {
    cacheSources();
    dbMock.enqueueFor("select", "official.sources", []);
    const response = await injectMutation(route, { ...request, url: "/official/sources?countryCodes=PL,FR" }, { runAuth: true });
    expect(response.json()).toEqual({ data: [] });
    expect(whereQuery("official.sources", "select")).toEqual({
      sql: '"official"."sources"."country_code" in ($1, $2)',
      params: ["PL", "FR"],
    });
  });

  it("answers an empty list to a guest without asking for datasets when no source is visible", async () => {
    scriptGuestVisibility([]);
    dbMock.enqueueFor("select", "official.sources", [switchedOffSource]);
    const response = await injectMutation(route, request, { runAuth: true });
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.map((call) => call.table)).toEqual(["official.sources"]);
  });

  it("rejects an unknown query parameter", async () => {
    expectError(await injectMutation(route, { ...request, url: "/official/sources?isVisible=true" }, signInAs("admin")), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});

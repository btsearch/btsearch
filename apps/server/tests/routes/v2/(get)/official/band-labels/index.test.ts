import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/official/band-labels/index.js";
import { dbMock, redisMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";
import { expectDocumented, scriptAdminVisibility, scriptGuestVisibility, tablesRead } from "../../../../../helpers/officialDataFixtures.js";
import { signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/band-labels" };

function stored(rat: string, labelMhz: number, variant: string, countryCode = "PL", sourceId = 1, sourceKey = "pl-uke") {
  return { countryCode, sourceId, sourceKey, rat, labelMhz, variant };
}

const STORED = [
  stored("GSM", 900, "railway"),
  stored("IOT", 800, "commercial"),
  stored("LTE", 2600, "commercial"),
  stored("GSM", 900, "commercial"),
  stored("NR", 3500, "commercial"),
  stored("LTE", 800, "commercial"),
  stored("CDMA", 420, "commercial"),
  stored("UMTS", 2100, "commercial"),
  stored("LTE", 800, "commercial", "XX", 2, "hidden-register"),
];

function label(rat: string, labelMhz: number, variant: string, name: string, countryCode = "PL", sourceKey = "pl-uke") {
  return { countryCode, sourceKey, rat, labelMhz, variant, name };
}

const PUBLIC_LABELS = [
  label("nr", 3500, "commercial", "NR 3500"),
  label("lte", 800, "commercial", "LTE 800"),
  label("lte", 2600, "commercial", "LTE 2600"),
  label("umts", 2100, "commercial", "UMTS 2100"),
  label("cdma", 420, "commercial", "CDMA 420"),
  label("gsm", 900, "commercial", "GSM 900"),
  label("gsm", 900, "railway", "GSM-R 900"),
  label("iot", 800, "commercial", "IOT 800"),
];

describe("GET /official/band-labels", () => {
  it("is documented for guests with the permit permission", () => {
    expectDocumented(route);
    expect(route.config).toMatchObject({ permissions: ["read:official_permits"], allowGuestAccess: true });
  });

  it("lists the labels of public sources, newest technology first, commercial before railway, then by frequency", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", STORED);

    const response = await injectMutation(route, request);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: PUBLIC_LABELS });
  });

  it("reads the labels once and keeps them in the cache, while visibility is checked on every request", async () => {
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.permits", STORED);
    await injectMutation(route, request);

    scriptGuestVisibility([1, 2]);
    const second = await injectMutation(route, request);

    expect(tablesRead().filter((table) => table === "official.permits")).toHaveLength(1);
    expect(redisMock.setEx.mock.calls.map(([key]) => key)).toEqual(["official:v2:band-labels"]);
    expect(second.json().data).toContainEqual(label("lte", 800, "commercial", "LTE 800", "XX", "hidden-register"));
  });

  it("leaves out labels used only in a country hidden from the caller", async () => {
    scriptGuestVisibility([1, 2], ["XX"]);
    dbMock.enqueueFor("select", "official.permits", STORED);

    const response = await injectMutation(route, request);

    expect(response.json().data).toEqual(PUBLIC_LABELS);
  });

  it("shows an administrator the labels of hidden sources", async () => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.permits", STORED);

    const response = await injectMutation(route, request, signInAs("admin"));

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toHaveLength(PUBLIC_LABELS.length + 1);
    expect(tablesRead()).not.toContain("official.sources");
  });

  it.each([
    ["countryCodes=XX", ["hidden-register"]],
    ["sourceKeys=pl-uke", ["pl-uke"]],
    ["countryCodes=PL&sourceKeys=hidden-register", []],
  ])("narrows the labels with %s", async (query, sourceKeys) => {
    scriptAdminVisibility();
    dbMock.enqueueFor("select", "official.permits", STORED);

    const response = await injectMutation(route, { ...request, url: `/official/band-labels?${query}` }, signInAs("admin"));

    expect([...new Set(response.json().data.map((entry: { sourceKey: string }) => entry.sourceKey))]).toEqual(sourceKeys);
  });

  it("reads the database without the cache while it is unavailable", async () => {
    redisMock.isReady = false;
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "official.sources", [{ id: 1, countryCode: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "official.permits", STORED);

    const response = await injectMutation(route, request);

    expect(response.json().data).toEqual(PUBLIC_LABELS);
    expect(redisMock.setEx).not.toHaveBeenCalled();
  });

  it.each(["countryCodes=pl", "sourceKeys=", "rats=lte"])("rejects the invalid query %s", async (query) => {
    expectError(await injectMutation(route, { ...request, url: `/official/band-labels?${query}` }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/countries/[code].js";
import { cacheInRedis, dbMock, redisMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = {
  code: "PL",
  isVisible: false,
  contributions: "closed",
  tools: ["analyzer", "measurements"],
  structureOwnerProposals: true,
  psc: false,
  bsic: false,
  observationsPublic: true,
  viewWest: null,
  viewSouth: null,
  viewEast: null,
  viewNorth: null,
};
const request = { method: "PATCH" as const, url: "/countries/PL", payload: { isVisible: false } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

function scriptSourceCapabilities(sources: { id: number; countryCode: string; isVisible: boolean; layers: string[] }[] = []) {
  dbMock.enqueueFor("select", "countries", []);
  dbMock.enqueueFor("select", "official.sources", sources);
}

describe("PATCH /countries/PL", () => {
  it.each([{ structureOwnerProposals: false }, { psc: true }, { bsic: true }, { observationsPublic: false }])(
    "updates country features independently %j",
    async (features) => {
      dbMock.query.countries.findFirst.mockResolvedValue(row);
      scriptAudit();
      dbMock.enqueueFor("update", "countries", [{ ...row, ...features }]);
      scriptSourceCapabilities();
      const response = await injectMutation(route, { ...request, payload: { features } }, options);
      expect(response.statusCode).toBe(200);
      expect(response.json().data.features).toEqual({
        structureOwnerProposals: true,
        psc: false,
        bsic: false,
        observationsPublic: true,
        ...features,
      });
      const values = dbMock.calls.find((call) => call.operation === "update" && call.table === "countries")?.values;
      expect(values).toMatchObject(features);
      for (const name of ["structureOwnerProposals", "psc", "bsic", "observationsPublic"])
        if (!(name in features)) expect(values).not.toHaveProperty(name);
      expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    },
  );

  it("replaces the whole list of tools", async () => {
    dbMock.query.countries.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("update", "countries", [{ ...row, tools: ["measurements"] }]);
    scriptSourceCapabilities();
    const response = await injectMutation(route, { ...request, payload: { tools: ["measurements"] } }, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "countries")?.values).toMatchObject({ tools: ["measurements"] });
  });

  it("rejects a list that names a tool twice", async () => {
    const response = await injectMutation(route, { ...request, payload: { tools: ["analyzer", "analyzer"] } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "tools", validationMessage: "Must not repeat a tool" }]);
  });

  it.each([{ features: {} }, { features: { psc: null } }, { features: { bsic: "true" } }, { features: { unknown: true } }])(
    "rejects invalid country feature changes %j",
    async (payload) => {
      expectError(await injectMutation(route, { ...request, payload }, options), 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );

  it.each([{ defaultView: null }, { defaultView: { west: -180, south: -90, east: 180, north: 90 } }])(
    "replaces or clears the whole default view %j",
    async ({ defaultView }) => {
      const expected = {
        viewWest: defaultView?.west ?? null,
        viewSouth: defaultView?.south ?? null,
        viewEast: defaultView?.east ?? null,
        viewNorth: defaultView?.north ?? null,
      };
      dbMock.query.countries.findFirst.mockResolvedValue(row);
      scriptAudit();
      dbMock.enqueueFor("update", "countries", [{ ...row, ...expected }]);
      scriptSourceCapabilities();
      const response = await injectMutation(route, { ...request, payload: { defaultView } }, options);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ data: { isVisible: false, defaultView } });
      expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "countries")?.values).toMatchObject(expected);
    },
  );

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.query.countries.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("update", "countries", [row]);
    scriptSourceCapabilities([{ id: 1, countryCode: "PL", isVisible: true, layers: ["sites"] }]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.capabilities).toMatchObject({ official: true, microwaveLinks: false, kmz: true });
    const mutation = dbMock.calls.find((call) => call.operation === "update" && call.table === "countries");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toMatchObject({ data: { code: "PL" } });
  });

  it("forgets the cached country visibility once the change is saved, and answers from a fresh read", async () => {
    cacheInRedis("countries:v2:visibility", [{ code: "PL", isVisible: true }]);
    scriptAudit();
    dbMock.query.countries.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("update", "countries", [row]);
    scriptSourceCapabilities();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(redisMock.del).toHaveBeenCalledWith("countries:v2:visibility");
    expect(redisMock.del.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...dbMock.update.mock.invocationCallOrder));
    expect(dbMock.calls.filter((call) => call.operation === "select" && call.table === "countries")).toHaveLength(1);
  });

  it("returns 404 for a missing resource without writing an audit operation", async () => {
    dbMock.query.countries.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it("does not audit an update that returns no record", async () => {
    scriptAudit();
    dbMock.query.countries.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("update", "countries", []);
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it("rejects an empty patch before database access", async () => {
    const response = await injectMutation(route, { ...request, payload: {} }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});

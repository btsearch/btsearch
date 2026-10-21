import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/spectrum-holdings/index.js";
import { scriptMaintainer } from "../../../../helpers/auditFixtures.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const payload = { operatorId: 1, bandId: 7, downlinkKhz: [1805000, 1835000], uplinkKhz: [1710000, 1740000], validTo: "2037-12-31", source: "UKE" };
const request = { method: "POST" as const, url: "/spectrum-holdings", payload };
const adminOptions = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };
const editorOptions = { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "editor") };
const row = {
  id: 5,
  operatorId: 1,
  jointOperatorId: null,
  bandId: 7,
  regionId: null,
  downlinkLowKhz: 1805000,
  downlinkHighKhz: 1835000,
  uplinkLowKhz: 1710000,
  uplinkHighKhz: 1740000,
  validFrom: null,
  validTo: "2037-12-31",
  source: "UKE",
  createdAt: new Date("2026-10-21T00:00:00Z"),
  updatedAt: new Date("2026-10-21T00:00:00Z"),
};

function scriptValidBand() {
  dbMock.enqueueFor("select", "bands", [{ code: "B3", planBandId: 7 }]);
}

function wasInserted(): boolean {
  return dbMock.calls.some((call) => call.operation === "insert" && call.table === "spectrum_holdings");
}

describe("POST /spectrum-holdings", () => {
  it("lets a maintainer of the operator's country create and audit a holding", async () => {
    scriptMaintainer();
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptAudit();
    scriptValidBand();
    dbMock.enqueueFor("select", "spectrum_holdings", []);
    dbMock.enqueueFor("insert", "spectrum_holdings", [row]);

    const response = await injectMutation(route, request, editorOptions);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { id: 5, downlinkKhz: [1805000, 1835000], uplinkKhz: [1710000, 1740000], regionId: null } });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
  });

  it("refuses a maintainer of another country before opening a transaction", async () => {
    scriptMaintainer();
    dbMock.enqueueFor("select", "operators", [{ countryCode: "DE" }]);

    const response = await injectMutation(route, request, editorOptions);
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS", "Only a maintainer of this country or an administrator can change its spectrum holdings");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("refuses a band outside the band plan of the operator's country", async () => {
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [{ code: "B3", planBandId: null }]);

    expectError(await injectMutation(route, request, adminOptions), 400, "BAD_REQUEST", "The band is not in the band plan of the operator's country");
    expect(wasInserted()).toBe(false);
  });

  it.each([
    { change: { downlinkKhz: [1800000, 1835000] }, message: "The downlink range lies outside the band" },
    { change: { uplinkKhz: [1700000, 1740000] }, message: "The uplink range lies outside the band" },
    { change: { uplinkKhz: null }, message: "A holding in an FDD band needs an uplink range" },
  ])("refuses ranges that do not fit an FDD band: $message", async ({ change, message }) => {
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptAudit();
    scriptValidBand();

    expectError(await injectMutation(route, { ...request, payload: { ...payload, ...change } }, adminOptions), 400, "BAD_REQUEST", message);
    expect(wasInserted()).toBe(false);
  });

  it("refuses an uplink in a TDD band", async () => {
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [{ code: "n78", planBandId: 9 }]);

    const tddPayload = { ...payload, bandId: 9, downlinkKhz: [3400000, 3500000], uplinkKhz: [3400000, 3500000] };
    expectError(
      await injectMutation(route, { ...request, payload: tddPayload }, adminOptions),
      400,
      "BAD_REQUEST",
      "Only a holding in an FDD band can have an uplink range",
    );
  });

  it("creates a jointly held holding when the joint operator is in the same country", async () => {
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }], [{ countryCode: "PL" }]);
    scriptAudit();
    scriptValidBand();
    dbMock.enqueueFor("select", "spectrum_holdings", []);
    dbMock.enqueueFor("insert", "spectrum_holdings", [{ ...row, jointOperatorId: 2 }]);

    const response = await injectMutation(route, { ...request, payload: { ...payload, jointOperatorId: 2 } }, adminOptions);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { operatorId: 1, jointOperatorId: 2 } });
  });

  it.each([
    { jointOperatorId: 1, jointCountry: [], message: "The joint operator must be another operator" },
    { jointOperatorId: 2, jointCountry: [{ countryCode: "DE" }], message: "The joint operator is not in the operator's country" },
    { jointOperatorId: 3, jointCountry: [], message: "The joint operator is not in the operator's country" },
  ])("refuses joint operator $jointOperatorId: $message", async ({ jointOperatorId, jointCountry, message }) => {
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }], jointCountry);
    scriptAudit();
    scriptValidBand();

    expectError(await injectMutation(route, { ...request, payload: { ...payload, jointOperatorId } }, adminOptions), 400, "BAD_REQUEST", message);
    expect(wasInserted()).toBe(false);
  });

  it("refuses a range that overlaps another holding in the country", async () => {
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptAudit();
    scriptValidBand();
    dbMock.enqueueFor("select", "spectrum_holdings", [{ id: 3 }]);

    expectError(await injectMutation(route, request, adminOptions), 409, "CONFLICT", "The range overlaps another spectrum holding in this country");
    expect(wasInserted()).toBe(false);
  });

  it("rejects a licence that ends before it starts before database access", async () => {
    const response = await injectMutation(route, { ...request, payload: { ...payload, validFrom: "2038-01-01" } }, adminOptions);
    expect(response.statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});

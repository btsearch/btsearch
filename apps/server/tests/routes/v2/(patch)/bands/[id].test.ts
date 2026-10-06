import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/bands/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, rat: "LTE", code: "B3", name: "LTE 1800", value: 1800, duplex: "FDD", variant: "commercial" };
const request = { method: "PATCH" as const, url: "/bands/7", payload: { name: "LTE 1800" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("PATCH /bands/7", () => {
  it.each([
    { code: "B7", labelMhz: undefined, value: 2600 },
    { code: "B3", labelMhz: 1900, value: 1900 },
  ])("uses the catalogue frequency unless an explicit label is supplied for $code", async ({ code, labelMhz, value }) => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor("update", "bands", [{ ...row, code, value }]);
    const response = await injectMutation(route, { ...request, payload: { code, ...(labelMhz === undefined ? {} : { labelMhz }) } }, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "bands")?.values).toMatchObject({ code, value, duplex: "FDD" });
  });

  it("preserves a customised frequency label when re-sending the current catalogue code", async () => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue({ ...row, value: 1900 });
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor("update", "bands", [{ ...row, value: 1900 }]);
    expect((await injectMutation(route, { ...request, payload: { code: "B3" } }, options)).statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "bands")?.values).toMatchObject({ value: undefined });
  });

  it("checks the identity when changing a codeless legacy band's frequency", async () => {
    scriptAudit();
    const current = { ...row, code: null, duplex: null };
    dbMock.query.bands.findFirst.mockResolvedValue(current);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor("update", "bands", [{ ...current, value: 1900 }]);
    expect((await injectMutation(route, { ...request, payload: { labelMhz: 1900 } }, options)).statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "bands")?.values).toMatchObject({
      value: 1900,
      code: undefined,
      duplex: undefined,
    });
  });

  it("rejects editing the reserved unknown band", async () => {
    dbMock.query.bands.findFirst.mockResolvedValue({ ...row, code: null, value: 0 });
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("fails without auditing when the updated band disappears", async () => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor("update", "bands", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies the documented catalog or band-plan mutation", async () => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor("update", "bands", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: 7, rat: "lte", code: "B3", duplex: "fdd", labelMhz: 1800 } });
  });

  it("returns 404 for a missing band", async () => {
    dbMock.query.bands.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects moving the band to another technology", async () => {
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    const response = await injectMutation(route, { ...request, payload: { code: "n78" } }, options);
    expectError(response, 400, "BAD_REQUEST", "A band cannot move to another technology");
  });
});

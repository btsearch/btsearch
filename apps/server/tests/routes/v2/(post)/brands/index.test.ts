import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/brands/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, slug: "network", name: "Network", color: "#123456", logoFile: null, logoWidth: null, logoHeight: null };
const request = { method: "POST" as const, url: "/brands", payload: { slug: "network", name: "Network", color: "#123456" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("POST /brands", () => {
  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies and audits the documented change", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "brands", []);
    dbMock.enqueueFor("insert", "brands", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    const mutation = dbMock.calls.find((call) => call.operation === "insert" && call.table === "brands");
    expect(mutation).toBeDefined();
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
    expect(response.json()).toMatchObject({ data: { id: 7 } });
  });

  it("returns a creation failure when the database creates no record", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "brands", []);
    dbMock.enqueueFor("insert", "brands", []);
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });
});

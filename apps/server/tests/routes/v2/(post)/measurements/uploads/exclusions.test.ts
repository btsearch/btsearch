import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(post)/measurements/uploads/exclusions.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../../helpers/mutationAssertions.js";

const adminId = userSession().user.id;
const spammerId = "22222222-2222-4222-8222-222222222222";
const uploadIds = ["01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e", "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f"];

function exclude(payload: object) {
  return injectMutation(route, { method: "POST", url: "/measurements/uploads/exclusions", payload }, { session: userSession(adminId, "admin") });
}

describe("POST /measurements/uploads/exclusions", () => {
  it("excludes every upload of a person that is not withdrawn or excluded yet, and audits each one", async () => {
    dbMock.enqueueFor("select", "users", [{ id: spammerId }]);
    dbMock.enqueueFor(
      "select",
      "uploads",
      uploadIds.map((id) => ({ id, status: "received", statusReason: null })),
    );
    scriptAudit();
    dbMock.enqueueFor("update", "uploads", []);
    const response = await exclude({ userId: spammerId, reason: "Fake readings" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { excludedCount: 2 } });
    const { params } = whereQuery("uploads", "select");
    expect(params).toEqual(expect.arrayContaining(["received", "processing", "processed", "rejected"]));
    expect(params).not.toContain("withdrawn");
    expect(params).not.toContain("excluded");
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "uploads")?.values).toMatchObject({
      status: "excluded",
      statusReason: "Fake readings",
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject(
      uploadIds.map((id) => ({ entity: "uploads", record_id: id, new_values: { status: "excluded", statusReason: "Fake readings" } })),
    );
  });

  it("excludes nothing for a `userId` that no account has", async () => {
    dbMock.enqueueFor("select", "users", []);
    expectError(await exclude({ userId: spammerId, reason: "Fake readings" }), 404, "NOT_FOUND", "No account has this `userId`");
  });

  it("excludes nothing when an id in `uploadIds` is not an upload", async () => {
    dbMock.enqueueFor("select", "uploads", [{ total: 1 }]);
    expectError(await exclude({ uploadIds, reason: "Fake readings" }), 404, "NOT_FOUND", "Not every upload in `uploadIds` exists");
  });
});

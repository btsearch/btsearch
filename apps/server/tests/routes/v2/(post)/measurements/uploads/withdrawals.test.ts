import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(post)/measurements/uploads/withdrawals.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

const uploadIds = ["01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e", "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0f"];

function withdraw(payload: object) {
  return injectMutation(route, { method: "POST", url: "/measurements/uploads/withdrawals", payload }, { session: userSession() });
}

function engineRunInserts() {
  return dbMock.calls.filter((call) => call.operation === "insert" && call.table === "engine_runs");
}

describe("POST /measurements/uploads/withdrawals", () => {
  it("queues a subtraction when a withdrawn upload was folded", async () => {
    dbMock.enqueueFor("select", "uploads", [{ total: 2 }]);
    dbMock.enqueueFor(
      "update",
      "uploads",
      uploadIds.map((id) => ({ id })),
    );
    dbMock.enqueueFor("select", "upload_folds", [{ uploadId: uploadIds[0], objectDeletedAt: null }]);
    dbMock.enqueueFor("select", "engine_runs", []);
    dbMock.enqueueFor("insert", "engine_runs", []);
    dbMock.enqueueFor("execute", undefined, []);
    const response = await withdraw({ uploadIds });

    expect(response.json()).toEqual({ data: { withdrawnCount: 2 } });
    expect(engineRunInserts().map((call) => call.values)).toEqual([{ kind: "subtract" }]);
  });

  it("adds no second subtraction while one waits", async () => {
    dbMock.enqueueFor("select", "uploads", [{ total: 2 }]);
    dbMock.enqueueFor(
      "update",
      "uploads",
      uploadIds.map((id) => ({ id })),
    );
    dbMock.enqueueFor("select", "upload_folds", [{ uploadId: uploadIds[0], objectDeletedAt: null }]);
    dbMock.enqueueFor("select", "engine_runs", [{ id: "01a12096-8da0-7c1d-9b2e-000000000001" }]);
    dbMock.enqueueFor("execute", undefined, []);
    await withdraw({ uploadIds });

    expect(engineRunInserts()).toEqual([]);
  });

  it("queues nothing for uploads that were never folded or whose files are gone", async () => {
    dbMock.enqueueFor("select", "uploads", [{ total: 2 }]);
    dbMock.enqueueFor(
      "update",
      "uploads",
      uploadIds.map((id) => ({ id })),
    );
    dbMock.enqueueFor("select", "upload_folds", [{ uploadId: uploadIds[1], objectDeletedAt: new Date("2026-10-01T00:00:00Z") }]);
    const response = await withdraw({ uploadIds });

    expect(response.statusCode).toBe(200);
    expect(engineRunInserts()).toEqual([]);
  });

  it("withdraws nothing when one of the named uploads is not yours", async () => {
    dbMock.enqueueFor("select", "uploads", [{ total: 1 }]);
    expectError(await withdraw({ uploadIds }), 404, "NOT_FOUND", "Not every upload in `uploadIds` is yours");
  });
});

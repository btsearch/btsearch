import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/official/sources/[key].js";
import { dbMock, redisMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { STAFF_ID, datasetRow, signInAs, sourceRow } from "../../../../../helpers/officialFixtures.js";

const request = { method: "PATCH" as const, url: "/official/sources/test-register", payload: { isEnabled: false } };

function scriptSource(updated: typeof sourceRow) {
  dbMock.enqueueFor("update", "official.sources", [updated]);
  dbMock.enqueueFor("select", "official.datasets", [datasetRow]);
  dbMock.enqueueFor("select", "official.dataset_slices", []);
}

function scriptAnswer(updated: typeof sourceRow) {
  scriptAudit();
  scriptSource(updated);
}

function writesTo(table: string) {
  return dbMock.calls.filter((call) => call.table === table && call.operation !== "select");
}

describe("PATCH /official/sources/:key", () => {
  it("switches the schedule off and leaves the visibility alone", async () => {
    dbMock.enqueueFor("select", "official.sources", [sourceRow]);
    scriptAnswer({ ...sourceRow, isEnabled: false });
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ key: "test-register", isEnabled: false, isVisible: true, datasets: [{ id: 11, slices: [] }] });
    const values = dbMock.calls.find((call) => call.operation === "update" && call.table === "official.sources")?.values;
    expect(values).toMatchObject({ isEnabled: false, isVisible: undefined });
    expect(whereQuery("official.sources", "select").params).toEqual(["test-register"]);
    expect(whereQuery("official.sources", "update").params).toEqual([1]);
    expect(redisMock.del).toHaveBeenCalledWith("official:v3:source-visibility");
    expect(redisMock.del.mock.invocationCallOrder[0]).toBeGreaterThan(Math.max(...dbMock.update.mock.invocationCallOrder));
  });

  it("audits the change as one operation with the source before and after it", async () => {
    const paused = { ...sourceRow, isEnabled: false, updatedAt: new Date("2026-10-12T09:00:00.000Z") };
    dbMock.enqueueFor("select", "official.sources", [sourceRow]);
    scriptAnswer(paused);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(writesTo("audit_operations")[0]?.values).toMatchObject({
      kind: "official_source.update",
      source: "api",
      actor_id: STAFF_ID,
      performed_by: STAFF_ID,
      client_key: null,
    });
    expect(writesTo("audit_logs").map((call) => call.values)).toEqual([
      [
        {
          operation_id: 1,
          entity: "official_sources",
          op: "update",
          record_id: "1",
          station_id: null,
          old_values: sourceRow,
          new_values: paused,
          metadata: null,
        },
      ],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves nothing in the audit log when the change is what the source already has", async () => {
    dbMock.enqueueFor("select", "official.sources", [sourceRow]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    scriptSource(sourceRow);
    const response = await injectMutation(route, { ...request, payload: { isEnabled: true, isVisible: true } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ isEnabled: true, isVisible: true });
    expect(writesTo("audit_logs")).toEqual([]);
    expect(writesTo("audit_operations").map((call) => call.operation)).toEqual(["insert", "delete"]);
    expect(whereQuery("audit_operations", "delete").params).toEqual([1]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("never makes a source visible whose terms forbid publishing, and says so before the database does", async () => {
    dbMock.enqueueFor("select", "official.sources", [{ ...sourceRow, isRedistributable: false, isVisible: false }]);
    const response = await injectMutation(route, { ...request, payload: { isVisible: true } }, signInAs("admin"));
    expectError(response, 409, "CONFLICT", "The terms of this source do not allow its data to be published, so it cannot be made visible");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("still switches the scheduled imports of a source whose terms forbid publishing", async () => {
    const closed = { ...sourceRow, isRedistributable: false, isVisible: false, isEnabled: false };
    dbMock.enqueueFor("select", "official.sources", [closed]);
    scriptAnswer({ ...closed, isEnabled: true });
    const response = await injectMutation(route, { ...request, payload: { isEnabled: true, isVisible: false } }, signInAs("admin"));
    expect(response.json().data).toMatchObject({ isEnabled: true, isVisible: false, isRedistributable: false });
  });

  it("returns 404 for an unknown key without writing", async () => {
    dbMock.enqueueFor("select", "official.sources", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it.each([{}, { isEnabled: "yes" }, { isVisible: null }, { isRedistributable: true }, { isEnabled: true, license: "none" }])(
    "rejects the invalid change %j before reading anything",
    async (payload) => {
      expectError(await injectMutation(route, { ...request, payload }, signInAs("admin")), 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );

  it("refuses an editor before reading anything", async () => {
    expectError(await injectMutation(route, request, signInAs("editor")), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it("answers a controlled failure when the update returns no row, without an audit entry", async () => {
    dbMock.enqueueFor("select", "official.sources", [sourceRow]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("update", "official.sources", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 500, "FAILED_TO_UPDATE");
    expect(writesTo("audit_logs")).toEqual([]);
  });
});

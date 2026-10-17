import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/official/datasets/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { RELEASE_SHA256, STAFF_ID, datasetRow, signInAs } from "../../../../../helpers/officialFixtures.js";

type DatasetRow = Omit<typeof datasetRow, "holdShrinkPercent"> & { holdShrinkPercent: number | null };

const request = { method: "PATCH" as const, url: "/official/datasets/11", payload: { isEnabled: false } };

function scriptStoredDataset(stored: DatasetRow, updated: DatasetRow) {
  dbMock.enqueueFor("select", "official.datasets", [{ dataset: stored, sourceKey: "test-register" }]);
  dbMock.enqueueFor("update", "official.datasets", [updated]);
  dbMock.enqueueFor("select", "official.dataset_slices", [
    { datasetId: 11, key: "LTE:800:commercial", importedAt: new Date("2026-10-10T06:00:00.000Z"), releaseSha256: RELEASE_SHA256 },
  ]);
}

function scriptDataset(updated: DatasetRow, stored: DatasetRow = datasetRow) {
  scriptAudit();
  scriptStoredDataset(stored, updated);
}

function writtenValues() {
  return dbMock.calls.find((call) => call.operation === "update" && call.table === "official.datasets")?.values;
}

function writesTo(table: string) {
  return dbMock.calls.filter((call) => call.table === table && call.operation !== "select");
}

describe("PATCH /official/datasets/:id", () => {
  it("pauses one dataset and answers it with its source and slices", async () => {
    scriptDataset({ ...datasetRow, isEnabled: false });
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: {
        id: 11,
        sourceKey: "test-register",
        key: "permits",
        layer: "sites",
        importedAt: "2026-10-10T06:00:00.000Z",
        isEnabled: false,
        checkEveryHours: 6,
        nextCheckAt: "2026-10-12T12:00:00.000Z",
        holdShrinkPercent: null,
        defaultHoldShrinkPercent: 20,
        slices: [{ key: "LTE:800:commercial", importedAt: "2026-10-10T06:00:00.000Z", releaseSha256: RELEASE_SHA256 }],
      },
    });
    expect(whereQuery("official.datasets", "update").params).toEqual([11]);
  });

  it("changes the cadence and the hold threshold, and writes nothing it was not sent", async () => {
    scriptDataset({ ...datasetRow, checkEveryHours: 24, holdShrinkPercent: 50 });
    const response = await injectMutation(route, { ...request, payload: { checkEveryHours: 24, holdShrinkPercent: 50 } }, signInAs("admin"));
    expect(response.json().data).toMatchObject({ checkEveryHours: 24, holdShrinkPercent: 50, defaultHoldShrinkPercent: 20 });
    expect(writtenValues()).toMatchObject({ isEnabled: undefined, checkEveryHours: 24, holdShrinkPercent: 50 });
  });

  it("restores the default threshold with null", async () => {
    scriptDataset({ ...datasetRow, holdShrinkPercent: null }, { ...datasetRow, holdShrinkPercent: 50 });
    const response = await injectMutation(route, { ...request, payload: { holdShrinkPercent: null } }, signInAs("admin"));
    expect(response.json().data).toMatchObject({ holdShrinkPercent: null, defaultHoldShrinkPercent: 20 });
    expect(writtenValues()).toMatchObject({ holdShrinkPercent: null, checkEveryHours: undefined });
  });

  it("audits the change as one operation with the dataset before and after it", async () => {
    const changed = { ...datasetRow, checkEveryHours: 24, holdShrinkPercent: 50, updatedAt: new Date("2026-10-12T09:00:00.000Z") };
    scriptDataset(changed);
    const response = await injectMutation(route, { ...request, payload: { checkEveryHours: 24, holdShrinkPercent: 50 } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(writesTo("audit_operations")[0]?.values).toMatchObject({
      kind: "official_dataset.update",
      source: "api",
      actor_id: STAFF_ID,
      performed_by: STAFF_ID,
      client_key: null,
    });
    expect(writesTo("audit_logs").map((call) => call.values)).toEqual([
      [
        {
          operation_id: 1,
          entity: "official_datasets",
          op: "update",
          record_id: "11",
          station_id: null,
          old_values: datasetRow,
          new_values: changed,
          metadata: null,
        },
      ],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves nothing in the audit log when the change is what the dataset already has", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    scriptStoredDataset(datasetRow, datasetRow);
    const payload = { isEnabled: true, checkEveryHours: 6, holdShrinkPercent: null };
    const response = await injectMutation(route, { ...request, payload }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject(payload);
    expect(writesTo("audit_logs")).toEqual([]);
    expect(writesTo("audit_operations").map((call) => call.operation)).toEqual(["insert", "delete"]);
    expect(whereQuery("audit_operations", "delete").params).toEqual([1]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("answers a controlled failure when the update returns no row, without an audit entry", async () => {
    dbMock.enqueueFor("select", "official.datasets", [{ dataset: datasetRow, sourceKey: "test-register" }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("update", "official.datasets", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 500, "FAILED_TO_UPDATE");
    expect(writesTo("audit_logs")).toEqual([]);
  });

  it("returns 404 for an unknown dataset without writing", async () => {
    dbMock.enqueueFor("select", "official.datasets", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it.each([
    {},
    { checkEveryHours: 0 },
    { checkEveryHours: 32768 },
    { checkEveryHours: 1.5 },
    { checkEveryHours: null },
    { holdShrinkPercent: -1 },
    { holdShrinkPercent: 101 },
    { isEnabled: null },
    { key: "towers" },
    { nextCheckAt: "2026-10-12T12:00:00.000Z" },
  ])("rejects the invalid change %j before reading anything", async (payload) => {
    expectError(await injectMutation(route, { ...request, payload }, signInAs("admin")), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects an id that is not a positive whole number", async () => {
    expectError(await injectMutation(route, { ...request, url: "/official/datasets/permits" }, signInAs("admin")), 400, "VALIDATION_ERROR");
  });

  it("refuses an editor before reading anything", async () => {
    expectError(await injectMutation(route, request, signInAs("editor")), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });
});

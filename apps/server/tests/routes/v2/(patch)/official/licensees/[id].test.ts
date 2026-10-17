import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/official/licensees/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { OTHER_RUN_ID, RUN_ID, STAFF_ID, licenseeRow, runRow, scriptStoredRun, signInAs } from "../../../../../helpers/officialFixtures.js";

type StoredLicensee = Omit<typeof licenseeRow, "operatorId" | "brandId"> & { operatorId: number | null; brandId: number | null };

const request = { method: "PATCH" as const, url: "/official/licensees/5", payload: { operatorId: 4 } };
const mapped = { ...licenseeRow, operatorId: 4 };
const branded = { ...licenseeRow, brandId: 3 };

function scriptAnswer(licensee: typeof licenseeRow) {
  dbMock.enqueueFor("select", "official.licensees", [{ licensee, sourceKey: "test-register" }]);
}

function scriptQueuedRun(run: typeof runRow, remap?: { fromOperatorId: number | null; toOperatorId: number | null }) {
  dbMock.enqueueFor("insert", "official.import_runs", [{ id: RUN_ID }]);
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 2 }]);
  scriptStoredRun(run, { remaps: remap ? [{ runId: RUN_ID, licenseeId: 5, ...remap }] : [] });
}

function scriptUnusedOperation() {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
  dbMock.enqueueFor("delete", "audit_operations", []);
}

function writes(table: string) {
  return dbMock.calls.filter((call) => call.table === table && call.operation !== "select");
}

function writtenTables() {
  return dbMock.calls.filter((call) => call.operation !== "select").map((call) => `${call.operation} ${call.table}`);
}

function recordedKinds() {
  return writes("audit_operations").flatMap((call) => (call.operation === "insert" ? [(call.values as { kind: string }).kind] : []));
}

function licenseeEntry(old: StoredLicensee, saved: StoredLicensee) {
  return [
    { operation_id: 1, entity: "licensees", op: "update", record_id: "5", station_id: null, old_values: old, new_values: saved, metadata: null },
  ];
}

describe("PATCH /official/licensees/:id", () => {
  it("gives an unmapped licensee its operator at once, drops its own brand and queues a replay of the enabled sites datasets", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "official.licensees", [branded]);
    dbMock.enqueueFor("select", "operators", [{ id: 4 }]);
    dbMock.enqueueFor("update", "official.licensees", [mapped]);
    dbMock.enqueueFor("select", "official.datasets", [{ id: 11 }, { id: 13 }]);
    dbMock.enqueueFor("insert", "official.import_run_datasets", []);
    scriptQueuedRun({ ...runRow, kind: "replay" });
    scriptAnswer(mapped);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      data: { id: 5, sourceKey: "test-register", operatorId: 4, brandId: null },
      importRun: { id: RUN_ID, kind: "replay", isDryRun: false, status: "queued", remap: null, requester: { id: STAFF_ID } },
    });
    expect(writes("official.licensees").map((call) => call.values)).toEqual([{ operatorId: 4, brandId: null }]);
    expect(whereQuery("official.datasets", "select").params).toEqual([1, "sites", true]);
    expect(writes("official.import_runs")[0]?.values).toEqual({
      sourceId: 1,
      kind: "replay",
      trigger: "manual",
      isDryRun: false,
      state: "queued",
      requestedById: STAFF_ID,
    });
    expect(writes("official.import_run_datasets")[0]?.values).toEqual([
      { runId: RUN_ID, datasetId: 11 },
      { runId: RUN_ID, datasetId: 13 },
    ]);
    expect(writes("audit_operations").flatMap((call) => (call.operation === "insert" ? [call.values] : []))).toMatchObject([
      { kind: "licensee.update", source: "api", actor_id: STAFF_ID, performed_by: STAFF_ID },
      { kind: "official.import", source: "import", metadata: { config: { licenseeId: 5, operatorId: 4 }, status: "queued", run_id: RUN_ID } },
    ]);
    expect(writes("audit_logs").map((call) => call.values)).toEqual([licenseeEntry(branded, mapped)]);
    expect(dbMock.calls.find((call) => call.table === "official.licensees")?.clauses.for).toEqual(["no key update"]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("maps the licensee without a run when the source has no enabled sites dataset, and still audits the mapping", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "official.licensees", [licenseeRow]);
    dbMock.enqueueFor("select", "operators", [{ id: 4 }]);
    dbMock.enqueueFor("update", "official.licensees", [mapped]);
    dbMock.enqueueFor("select", "official.datasets", []);
    scriptAnswer(mapped);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.json()).toMatchObject({ data: { operatorId: 4 }, importRun: null });
    expect(writes("official.import_runs")).toEqual([]);
    expect(recordedKinds()).toEqual(["licensee.update"]);
    expect(writes("audit_logs").map((call) => call.values)).toEqual([licenseeEntry(licenseeRow, mapped)]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("queues a remap dry run for another operator and leaves the licensee as it is", async () => {
    scriptUnusedOperation();
    dbMock.enqueueFor("select", "official.licensees", [mapped]);
    dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
    dbMock.enqueueFor("select", "official.remap_runs", []);
    dbMock.enqueueFor("insert", "official.remap_runs", []);
    scriptQueuedRun({ ...runRow, kind: "remap", isDryRun: true }, { fromOperatorId: 4, toOperatorId: 7 });
    scriptAnswer(mapped);
    const response = await injectMutation(route, { ...request, payload: { operatorId: 7 } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      data: { id: 5, operatorId: 4 },
      importRun: { id: RUN_ID, kind: "remap", isDryRun: true, datasets: [], remap: { licenseeId: 5, fromOperatorId: 4, toOperatorId: 7 } },
    });
    expect(writes("official.licensees")).toEqual([]);
    expect(writes("official.import_runs")[0]?.values).toMatchObject({ sourceId: 1, kind: "remap", isDryRun: true, trigger: "manual" });
    expect(writes("official.remap_runs")[0]?.values).toEqual({ runId: RUN_ID, licenseeId: 5, fromOperatorId: 4, toOperatorId: 7 });
    expect(writes("official.import_run_datasets")).toEqual([]);
    expect(whereQuery("official.remap_runs", "select").params).toEqual([5, "queued", "running"]);
    expect(recordedKinds()).toEqual(["licensee.update", "official.import"]);
    expect(whereQuery("audit_operations", "delete").params).toEqual([1]);
    expect(writes("audit_logs")).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("queues the remap that makes the change when the dry run is declined, also for removing the operator", async () => {
    scriptUnusedOperation();
    dbMock.enqueueFor("select", "official.licensees", [mapped]);
    dbMock.enqueueFor("select", "official.remap_runs", []);
    dbMock.enqueueFor("insert", "official.remap_runs", []);
    scriptQueuedRun({ ...runRow, kind: "remap" }, { fromOperatorId: 4, toOperatorId: null });
    scriptAnswer(mapped);
    const response = await injectMutation(route, { ...request, payload: { operatorId: null, isDryRun: false } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ data: { operatorId: 4 }, importRun: { kind: "remap", isDryRun: false, remap: { toOperatorId: null } } });
    expect(writes("official.import_runs")[0]?.values).toMatchObject({ kind: "remap", isDryRun: false });
    expect(writes("official.remap_runs")[0]?.values).toEqual({ runId: RUN_ID, licenseeId: 5, fromOperatorId: 4, toOperatorId: null });
    expect(writes("official.licensees")).toEqual([]);
    expect(dbMock.calls.some((call) => call.table === "operators")).toBe(false);
  });

  it("refuses a second remap while one is queued or running for the licensee", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "official.licensees", [mapped]);
    dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
    dbMock.enqueueFor("select", "official.remap_runs", [{ runId: OTHER_RUN_ID }]);
    const response = await injectMutation(route, { ...request, payload: { operatorId: 7 } }, signInAs("admin"));
    expectError(response, 409, "CONFLICT", "This licensee already has a remap run that is queued or running");
    expect(writtenTables()).toEqual(["insert audit_operations"]);
  });

  it("sets the brand of a licensee without an operator at once, without a run, and audits it", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "official.licensees", [licenseeRow]);
    dbMock.enqueueFor("select", "brands", [{ id: 3 }]);
    dbMock.enqueueFor("update", "official.licensees", [branded]);
    scriptAnswer(branded);
    const response = await injectMutation(route, { ...request, payload: { brandId: 3 } }, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: { id: 5, sourceKey: "test-register", name: "Example Mobile", legalName: "Example Mobile S.A.", operatorId: null, brandId: 3 },
      importRun: null,
    });
    expect(writes("official.licensees").map((call) => call.values)).toEqual([{ brandId: 3 }]);
    expect(recordedKinds()).toEqual(["licensee.update"]);
    expect(writes("audit_operations")[0]?.values).toMatchObject({ source: "api", actor_id: STAFF_ID, performed_by: STAFF_ID, client_key: null });
    expect(writes("audit_logs").map((call) => call.values)).toEqual([licenseeEntry(licenseeRow, branded)]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("removes the brand with null", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "official.licensees", [branded]);
    dbMock.enqueueFor("update", "official.licensees", [licenseeRow]);
    scriptAnswer(licenseeRow);
    const response = await injectMutation(route, { ...request, payload: { brandId: null } }, signInAs("admin"));
    expect(response.json()).toMatchObject({ data: { brandId: null }, importRun: null });
    expect(writes("official.licensees").map((call) => call.values)).toEqual([{ brandId: null }]);
    expect(writes("audit_logs").map((call) => call.values)).toEqual([licenseeEntry(branded, licenseeRow)]);
  });

  it("refuses a brand for a licensee that has an operator", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "official.licensees", [mapped]);
    const response = await injectMutation(route, { ...request, payload: { brandId: 3 } }, signInAs("admin"));
    expectError(response, 409, "CONFLICT", "A licensee with an operator has no brand of its own");
    expect(dbMock.calls.map((call) => `${call.operation} ${call.table}`)).toEqual(["insert audit_operations", "select official.licensees"]);
  });

  it("refuses a brand together with the removal of the operator, because the licensee keeps its operator until the remap", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "official.licensees", [mapped]);
    const response = await injectMutation(route, { ...request, payload: { operatorId: null, brandId: 3 } }, signInAs("admin"));
    expectError(response, 409, "CONFLICT");
    expect(writtenTables()).toEqual(["insert audit_operations"]);
  });

  it.each([
    ["the operator is the one the licensee has", mapped, { operatorId: 4 }],
    ["the brand is the one the licensee has", branded, { brandId: 3 }],
  ])("changes nothing, queues nothing and leaves nothing in the audit log when %s", async (_case, licensee, payload) => {
    scriptUnusedOperation();
    dbMock.enqueueFor("select", "official.licensees", [licensee]);
    scriptAnswer(licensee);
    const response = await injectMutation(route, { ...request, payload }, signInAs("admin"));
    expect(response.json()).toMatchObject({ data: payload, importRun: null });
    expect(writtenTables()).toEqual(["insert audit_operations", "delete audit_operations"]);
    expect(whereQuery("audit_operations", "delete").params).toEqual([1]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("answers 400 for an operator or a brand that does not exist", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }], [{ id: 2 }]);
    dbMock.enqueueFor("select", "official.licensees", [licenseeRow], [licenseeRow]);
    dbMock.enqueueFor("select", "operators", []);
    dbMock.enqueueFor("select", "brands", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 400, "BAD_REQUEST", "Operator not found");
    expectError(await injectMutation(route, { ...request, payload: { brandId: 3 } }, signInAs("admin")), 400, "BAD_REQUEST", "Brand not found");
    expect(writtenTables()).toEqual(["insert audit_operations", "insert audit_operations"]);
  });

  it("returns 404 for an unknown licensee", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "official.licensees", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 404, "NOT_FOUND");
    expect(dbMock.calls.map((call) => `${call.operation} ${call.table}`)).toEqual(["insert audit_operations", "select official.licensees"]);
  });

  it.each([{}, { isDryRun: false }, { operatorId: 4, brandId: 3 }, { operatorId: 0 }, { brandId: "3" }, { operatorId: 4, name: "Example" }])(
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

  it("answers a controlled failure when the transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, signInAs("admin")), 500, "FAILED_TO_UPDATE");
  });
});

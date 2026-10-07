import { auditOperations, extraIdentificators } from "@openbts/drizzle";
import { DrizzleQueryError } from "drizzle-orm";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import type { AuditEntry } from "../../../../../../src/features/audit/types.js";
import revertAuditOperation from "../../../../../../src/routes/v2/(post)/audit-operations/[id]/revert.js";
import { auditOperationRow, scriptMaintainer } from "../../../../../helpers/auditFixtures.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { readDate, readUserId } from "../../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const original: typeof auditOperations.$inferSelect = { ...auditOperationRow, kind: "station.edit", source: "api" };
const identifier: typeof extraIdentificators.$inferSelect = {
  id: 1,
  station_id: 1,
  networks_id: null,
  networks_name: "New",
  mno_name: null,
  createdAt: readDate,
  updatedAt: readDate,
};
const restored = { ...identifier, networks_name: "Old" };
const entry: AuditEntry = {
  id: 1,
  operation_id: 7,
  entity: "extra_identificators",
  op: "update",
  record_id: "1",
  station_id: 1,
  old_values: restored,
  new_values: identifier,
  metadata: null,
  createdAt: readDate,
};
const session = userSession(readUserId, "admin");
const request = {
  method: "POST" as const,
  url: "/audit-operations/7/revert",
  remoteAddress: "192.0.2.1",
  headers: { "content-type": "application/json", "user-agent": "Revert Browser" },
};
const PostgresFailure = postgres.PostgresError as unknown as new (fields: {
  message: string;
  code: string;
  query?: string;
  constraint_name?: string;
}) => postgres.PostgresError;

function scriptInitial(operation = original, entries: AuditEntry[] = [entry]) {
  dbMock.enqueueFor("select", "audit_operations", [operation]);
  dbMock.enqueueFor("select", "audit_logs", entries);
}

function countryRows(operationId: number) {
  return [{ operationId, entity: "extra_identificators", stationId: 1, recordId: "1", oldValues: identifier, newValues: restored }];
}

function scriptPlanned(current: typeof identifier | null = identifier, maintainer = false, entries = [entry]) {
  scriptInitial(original, entries);
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 8 }]);
  dbMock.enqueueFor("select", "audit_operations", [original], []);
  if (maintainer) dbMock.enqueueFor("select", "audit_logs", countryRows(7));
  dbMock.enqueueFor("select", "audit_logs", entries);
  dbMock.enqueueFor("select", "extra_identificators", current === null ? [] : [current]);
}

function scriptSuccess(force: boolean, maintainer: boolean, selected: boolean) {
  if (maintainer) scriptMaintainer();
  scriptPlanned(force ? { ...identifier, networks_name: "Newer" } : identifier, maintainer);
  const revertRow = {
    ...original,
    id: 8,
    kind: "revert",
    actor_id: readUserId,
    performed_by: readUserId,
    user_agent: "Revert Browser",
    reverts_operation_id: 7,
    metadata: { forced: force, partial: false, target_kind: original.kind, ...(selected ? { entry_ids: [1] } : {}) },
  };
  dbMock.enqueueFor("select", "audit_operations", [original], [{ id: 8, targetOperationId: 7, metadata: {} }], [], [revertRow]);
  dbMock.enqueueFor("select", "extra_identificators", [restored]);
  dbMock.enqueueFor("update", "extra_identificators", []);
  dbMock.enqueueFor("update", "stations", []);
  dbMock.enqueueFor("insert", "audit_logs", []);
  if (maintainer) dbMock.enqueueFor("select", "audit_logs", countryRows(8));
  dbMock.enqueueFor(
    "select",
    "audit_logs",
    [entry],
    [{ id: 2, operationId: 8, metadata: { reverts_entry_id: 1 } }],
    countryRows(8),
    [{ operation_id: 8, entity: "extra_identificators", op: "update", count: 1, station_ids: [1] }],
    countryRows(8),
  );
  dbMock.enqueueFor("select", "users", [{ id: readUserId, username: "tester", name: "Test User", image: null }]);
  dbMock.enqueueFor("update", "audit_operations", [], [], [], [], []);
  dbMock.enqueue(...Array.from({ length: maintainer ? 4 : 2 }, () => [{ id: 1, countryCode: "PL" }]));
}

describe("revertAuditOperation", () => {
  it.each(
    [false, true].flatMap((force) => [false, true].flatMap((maintainer) => [false, true].map((selected) => ({ force, maintainer, selected })))),
  )("restores the previous identifier and records complete lineage ($force, $maintainer, $selected)", async ({ force, maintainer, selected }) => {
    scriptSuccess(force, maintainer, selected);
    const errors: Error[] = [];
    const app = await createRouteHarness(revertAuditOperation, { session, onError: (error) => errors.push(error) });
    const response = await app.inject({ ...request, payload: JSON.stringify({ force, ...(selected ? { entryIds: [1] } : {}) }) });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      operation: {
        id: 8,
        kind: "revert",
        countryCode: "PL",
        revertsOperationId: 7,
        metadata: { forced: force, partial: false },
        entryCount: 1,
        counts: [{ entity: "extra_identificators", action: "update", count: 1 }],
        stationIds: [1],
        ipAddress: maintainer ? null : "192.0.2.1",
        userAgent: maintainer ? null : "Revert Browser",
      },
      revertedEntryIds: [1],
      skipped: [],
      skippedFields: [],
      affectedStationIds: [1],
    });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "extra_identificators")?.values).toMatchObject({
      networks_name: "Old",
      updatedAt: expect.any(Date),
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      {
        operation_id: 8,
        entity: "extra_identificators",
        op: "update",
        old_values: { networks_name: force ? "Newer" : "New" },
        new_values: { networks_name: "Old" },
        metadata: { reverts_entry_id: 1 },
      },
    ]);
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "audit_operations").map((call) => call.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reverted_by_operation_id: 8 }),
        expect.objectContaining({ metadata: expect.objectContaining({ forced: force, partial: false }) }),
      ]),
    );
    expect(dbMock.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "repeatable read" });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      client_key: null,
      kind: "revert",
      actor_id: readUserId,
      performed_by: readUserId,
      reverts_operation_id: 7,
    });
    if (selected)
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
        metadata: { entry_ids: [1] },
      });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("returns a renamed stale conflict before applying any record changes", async () => {
    scriptPlanned({ ...identifier, networks_name: "Newer" });
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: "{}" });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      errors: [
        {
          code: "CONFLICT",
          details: [
            {
              entryId: 1,
              entity: "extra_identificators",
              action: "update",
              recordId: "1",
              stationId: 1,
              kind: "stale",
              fields: [{ field: "networks_name", expected: "New", current: "Newer" }],
            },
          ],
        },
      ],
    });
    expect(response.json().errors[0].details[0]).not.toHaveProperty("entry_id");
    expect(response.json().errors[0].details[0]).not.toHaveProperty("forceResolution");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("explains a forced revert that cannot restore any missing record", async () => {
    scriptPlanned(null);
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: JSON.stringify({ force: true }) });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ errors: [{ code: "BAD_REQUEST", details: [{ entryId: 1, reason: "missing" }] }] });
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it.each(["40001", "40P01"])("turns transaction failure %s into a renamed concurrent conflict", async (code) => {
    scriptInitial();
    dbMock.transaction.mockRejectedValueOnce(new PostgresFailure({ code, message: "Concurrent update" }));
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: "{}" });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      errors: [{ code: "CONFLICT", details: [{ entryId: 1, action: "update", recordId: "1", stationId: 1, kind: "concurrent_modification" }] }],
    });
  });

  it.each(["40001", "40P01"])("unwraps Drizzle's transaction failure %s", async (code) => {
    scriptInitial();
    dbMock.transaction.mockRejectedValueOnce(
      new DrizzleQueryError("UPDATE audit_operations", [], new PostgresFailure({ code, message: "Concurrent update" })),
    );
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: "{}" });
    expect(response.statusCode).toBe(409);
    expect(response.json().errors[0].details[0].kind).toBe("concurrent_modification");
  });

  it.each([
    ["23505", "unique_violation", "UPDATE extra_identificators"],
    ["23503", "fk_missing", "UPDATE extra_identificators"],
    ["23503", "referenced", "DELETE FROM extra_identificators"],
  ])("reports database constraint %s (%s) even with force", async (code, kind, query) => {
    scriptPlanned();
    dbMock.enqueueFor(
      "update",
      "extra_identificators",
      new PostgresFailure({ code, query, message: "Constraint conflict", constraint_name: "identifier_constraint" }),
    );
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: JSON.stringify({ force: true }) });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      errors: [{ code: "CONFLICT", details: [{ entryId: 1, action: "update", kind, constraint: "identifier_constraint" }] }],
    });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("returns 404 for an operation that does not exist", async () => {
    dbMock.enqueueFor("select", "audit_operations", []);
    const app = await createRouteHarness(revertAuditOperation, { session });
    expect((await app.inject({ ...request, payload: "{}" })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([null, "DE"])("hides an operation outside a maintainer's reach (%s)", async (countryCode) => {
    scriptMaintainer();
    scriptInitial({ ...original, country_code: countryCode });
    const app = await createRouteHarness(revertAuditOperation, { session });
    expect((await app.inject({ ...request, payload: "{}" })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a guest before loading any operation", async () => {
    const app = await createRouteHarness(revertAuditOperation);
    expect((await app.inject({ ...request, payload: "{}" })).statusCode).toBe(403);
    expect(dbMock.calls).toHaveLength(0);
  });

  it("rejects an editor without a maintainer grant", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: true, regionId: null }]);
    const app = await createRouteHarness(revertAuditOperation, { session: userSession(readUserId, "editor") });
    expect((await app.inject({ ...request, payload: "{}" })).statusCode).toBe(403);
    expect(dbMock.calls.some((call) => call.table === "audit_operations")).toBe(false);
  });

  it("rejects selected entries from another operation before opening a transaction", async () => {
    scriptInitial();
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: JSON.stringify({ entryIds: [2] }) });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toContain("do not belong to this operation: 2");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(["alreadyReverted", "noEntries"])("rejects an unavailable operation (%s)", async (reason) => {
    scriptInitial(reason === "alreadyReverted" ? { ...original, reverted_by_operation_id: 9 } : original, reason === "noEntries" ? [] : [entry]);
    const app = await createRouteHarness(revertAuditOperation, { session });
    expect((await app.inject({ ...request, payload: "{}" })).statusCode).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("detects an operation reverted by another writer after the initial read", async () => {
    scriptInitial();
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 8 }]);
    dbMock.enqueueFor("select", "audit_operations", [{ ...original, reverted_by_operation_id: 9 }]);
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: "{}" });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toContain("already been reverted");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it.each(["missing", "countryChanged"])("hides an operation that became unavailable while opening the transaction (%s)", async (reason) => {
    if (reason === "countryChanged") scriptMaintainer();
    scriptInitial();
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 8 }]);
    dbMock.enqueueFor("select", "audit_operations", reason === "missing" ? [] : [{ ...original, country_code: "DE" }]);
    const app = await createRouteHarness(revertAuditOperation, { session });
    expect((await app.inject({ ...request, payload: "{}" })).statusCode).toBe(404);
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("renames the reason an imported entry is unsupported", async () => {
    const imported = { ...original, source: "import" as const };
    scriptInitial(imported);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 8 }]);
    dbMock.enqueueFor("select", "audit_operations", [imported], []);
    dbMock.enqueueFor("select", "audit_logs", [entry]);
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: "{}" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ errors: [{ code: "BAD_REQUEST", details: [{ entryId: 1, reason: "unsupported_op" }] }] });
  });

  it("prevents a maintainer reverting data that moved outside their country", async () => {
    scriptMaintainer();
    scriptInitial();
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 8 }]);
    dbMock.enqueueFor("select", "audit_operations", [original]);
    dbMock.enqueueFor("select", "audit_logs", countryRows(7));
    dbMock.enqueue([{ id: 1, countryCode: "DE" }]);
    const app = await createRouteHarness(revertAuditOperation, { session });
    const response = await app.inject({ ...request, payload: "{}" });
    expect(response.statusCode).toBe(403);
    expect(response.json().errors[0].message).toContain("no longer inside your country");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it.each([
    null,
    [],
    { force: "true" },
    { force: 1 },
    { entryIds: [] },
    { entryIds: [1, 1] },
    { entryIds: [0] },
    { entryIds: ["1"] },
    { entryIds: Array.from({ length: 501 }, (_, index) => index + 1) },
    { unknown: true },
  ])("rejects an invalid request contract before database access: %j", async (body) => {
    const app = await createRouteHarness(revertAuditOperation, { session });
    expect((await app.inject({ ...request, payload: JSON.stringify(body) })).statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});

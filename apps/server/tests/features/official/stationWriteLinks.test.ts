import { stations } from "@openbts/drizzle";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyRevertPlan } from "../../../src/features/audit/revert/apply.js";
import type { PlannedEntry } from "../../../src/features/audit/revert/types.js";
import type { AuditEntry, AuditRecorder } from "../../../src/features/audit/types.js";
import patchStationV1 from "../../../src/routes/v1/(patch)/stations/[id].js";
import postStationV1 from "../../../src/routes/v1/(post)/stations/index.js";
import patchLocation from "../../../src/routes/v2/(patch)/locations/[id].js";
import patchStation from "../../../src/routes/v2/(patch)/stations/[id].js";
import postStation from "../../../src/routes/v2/(post)/stations/index.js";
import reviewSubmission from "../../../src/routes/v2/(put)/submissions/[id]/review.js";
import type { DbTx } from "../../../src/types/global.js";
import { type DatabaseCall, dbMock, userSession } from "../../helpers/boundaries.js";
import { cellInputs } from "../../helpers/cellWriteFixtures.js";
import { recordTransactions } from "../../helpers/importEngineFixtures.js";
import { scriptAudit } from "../../helpers/mutationAssertions.js";
import { readDate, readLocation } from "../../helpers/readFixtures.js";
import { createRouteHarnessWithErrors } from "../../helpers/routeHarness.js";
import { stationRow, visibleStation } from "../../helpers/stationFixtures.js";
import { detachPlacedStation, movePlacedStation, placedStation } from "../../helpers/stationLocationFixtures.js";
import { submissionId } from "../../helpers/submissionFixtures.js";
import {
  prepareCombinedUpdatedReview,
  prepareNewReview,
  prepareUpdatedCellReview,
  reviewReviewerId,
  writeCombinedUpdatedReview,
  writeNewReview,
  writeUpdatedCellReview,
} from "../../helpers/submissionReviewFixtures.js";

const dialect = new PgDialect();
const admin = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };
const A1 = { operatorId: 1, siteId: "A1" };
const approval = { method: "PUT" as const, url: `/submissions/${submissionId}/review`, payload: { decision: "approve" } };
const reviewer = { session: userSession(reviewReviewerId, "admin") };

function whereOf(call: DatabaseCall | undefined) {
  return dialect.sqlToQuery(call?.clauses.where?.[0] as SQL);
}

function readsGroups(call: DatabaseCall): boolean {
  const selection = call.selection;
  const isGroupProjection = typeof selection === "object" && selection !== null && Object.keys(selection).join() === "operatorId,siteId";
  return call.operation === "select" && call.table === "stations" && isGroupProjection;
}

function locksGroups(call: DatabaseCall): boolean {
  return call.operation === "select" && call.table === "stations" && call.clauses.for !== undefined && whereOf(call).sql.includes("link_group");
}

function groupReads(): { sql: string; params: unknown[] }[] {
  return dbMock.calls.filter(readsGroups).map((call) => ({ sql: whereOf(call).sql, params: whereOf(call).params }));
}

function correctedGroups(): unknown[] {
  return dbMock.calls.filter(locksGroups).map((call) => JSON.parse(String(whereOf(call).params[0])));
}

function expectLinkedInsideTheWrite(write: (call: DatabaseCall) => boolean): void {
  const operations = dbMock.calls;
  const lock = operations.findIndex(locksGroups);
  const begin = operations.findLastIndex((call, index) => call.operation === "begin" && index < lock);
  const end = operations.findIndex((call, index) => (call.operation === "commit" || call.operation === "rollback") && index > lock);
  const written = operations.findIndex(write);

  expect(lock).toBeGreaterThan(-1);
  expect(operations[end]?.operation).toBe("commit");
  expect(written).toBeGreaterThan(begin);
  expect(written).toBeLessThan(lock);
  expect(
    operations.filter((call, index) => (index < begin || index > end) && (readsGroups(call) || call.table === "stations_official_sites")),
  ).toEqual([]);
}

function writes(operation: string, table: string) {
  return (call: DatabaseCall): boolean => call.operation === operation && call.table === table;
}

beforeEach(recordTransactions);

describe("a station write relinks its groups inside its own transaction", () => {
  it("links a station created through v2 to the official site of its site id and operator", async () => {
    const saved = stationRow({ status: "pending" });
    dbMock.enqueueFor("select", "operators", [{ id: 1 }]);
    dbMock.query.stations.findFirst.mockResolvedValueOnce(undefined).mockResolvedValue(saved);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("insert", "stations", [saved]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueStationLinks(
      [A1],
      [{ id: 1 }],
      [{ officialSiteId: 501, sourceId: 1, ...A1, longitude: 21, latitude: 52 }],
      [{ stationId: 1, ...A1, longitude: null, latitude: null }],
      [],
    );
    dbMock.enqueueFor("insert", "stations_official_sites", [{ stationId: 1, officialSiteId: 501 }]);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    visibleStation(saved);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const { app, errors } = await createRouteHarnessWithErrors(postStation, { session: userSession() });
    const response = await app.inject({ method: "POST", url: "/stations", payload: { station: { siteId: "A1", operatorId: 1 } } });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(201);
    expect(groupReads()).toEqual([{ sql: '(("stations"."id" in ($1)) or (false))', params: [1] }]);
    expect(correctedGroups()).toEqual([[A1]]);
    expect(dbMock.calls.find(writes("insert", "stations_official_sites"))?.values).toEqual([{ station_id: 1, official_site_id: 501 }]);
    expectLinkedInsideTheWrite(writes("insert", "stations"));
    expect(dbMock.query.officialPermits.findMany).not.toHaveBeenCalled();
  });

  it("relinks the old and the new group when a v2 edit changes the site id", async () => {
    const current = stationRow({ notes: null, location: null, sectors: [] });
    const saved = { ...current, station_id: "B2" };
    visibleStation(current);
    dbMock.query.stations.findFirst.mockResolvedValue(current);
    dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
    dbMock.query.stationBackhauls.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("select", "stations", []);
    dbMock.enqueueFor("update", "stations", [saved], []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueStationLinks([A1], [{ operatorId: 1, siteId: "B2" }]);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    visibleStation(saved);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const { app, errors } = await createRouteHarnessWithErrors(patchStation, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { siteId: "B2" } } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads().map(({ params }) => params)).toEqual([[1], [1]]);
    expect(correctedGroups()).toEqual([[A1, { operatorId: 1, siteId: "B2" }]]);
    expect(dbMock.calls.findIndex(readsGroups)).toBeLessThan(dbMock.calls.findIndex(writes("update", "stations")));
    expectLinkedInsideTheWrite(writes("update", "stations"));
  });

  it("relinks a station that a v2 edit moves to another location", async () => {
    movePlacedStation("station");
    dbMock.enqueueStationLinks([A1], [A1]);
    const { app, errors } = await createRouteHarnessWithErrors(patchStation, { session: userSession() });
    const response = await app.inject({
      method: "PATCH",
      url: "/stations/1",
      payload: { location: { latitude: 52.1, longitude: 21.1, regionId: 1 } },
    });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads()).toEqual([
      { sql: '(("stations"."id" in ($1)) or (false))', params: [1] },
      { sql: '(("stations"."id" in ($1)) or (false))', params: [1] },
    ]);
    expect(correctedGroups()).toEqual([[A1]]);
    expectLinkedInsideTheWrite(writes("update", "stations"));
  });

  it("relinks every station of a location that a v2 edit moves as a whole", async () => {
    movePlacedStation("location");
    dbMock.enqueueStationLinks([A1], [A1, { operatorId: 2, siteId: "B7" }]);
    const { app, errors } = await createRouteHarnessWithErrors(patchStation, { session: userSession() });
    const response = await app.inject({
      method: "PATCH",
      url: "/stations/1",
      payload: { location: { latitude: 52.1, longitude: 21.1, regionId: 1, move: "location" } },
    });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads()).toEqual([
      { sql: '(("stations"."id" in ($1)) or (false))', params: [1] },
      { sql: '(("stations"."id" in ($1)) or ("stations"."location_id" in ($2)))', params: [1, 2] },
    ]);
    expect(correctedGroups()).toEqual([[A1, { operatorId: 2, siteId: "B7" }]]);
    expectLinkedInsideTheWrite(writes("update", "locations"));
  });

  it("relinks a station that a v2 edit detaches from its location", async () => {
    const { current } = placedStation();
    detachPlacedStation(current);
    dbMock.enqueueStationLinks([A1], [A1]);
    const { app, errors } = await createRouteHarnessWithErrors(patchStation, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { location: null } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(correctedGroups()).toEqual([[A1]]);
    expectLinkedInsideTheWrite((call) => call.operation === "update" && call.table === "stations" && "location_id" in (call.values as object));
  });

  it("reads no group and corrects nothing for an edit that leaves the site id, operator and location alone", async () => {
    const current = stationRow({ notes: "old", location: null, sectors: [] });
    const saved = { ...current, notes: "new" };
    visibleStation(current);
    dbMock.query.stations.findFirst.mockResolvedValue(current);
    dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
    dbMock.query.stationBackhauls.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("update", "stations", [saved], []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    visibleStation(saved);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const { app, errors } = await createRouteHarnessWithErrors(patchStation, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { notes: "new" } } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads()).toEqual([]);
    expect(correctedGroups()).toEqual([]);
  });

  it("links the station that an approved new-station submission creates, in the approval's transaction", async () => {
    const proposed = { operatorId: 7, siteId: "PROPOSED-12" };
    writeNewReview(prepareNewReview([], { withSector: false }));
    dbMock.enqueueStationLinks([proposed]);
    const { app, errors } = await createRouteHarnessWithErrors(reviewSubmission, reviewer);
    const response = await app.inject(approval);

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads()).toEqual([{ sql: '(("stations"."id" in ($1)) or (false))', params: [12] }]);
    expect(correctedGroups()).toEqual([[proposed]]);
    expectLinkedInsideTheWrite(writes("insert", "stations"));
    expect(dbMock.calls.findIndex(locksGroups)).toBeLessThan(dbMock.calls.findIndex(writes("update", "submissions")));
    expect(dbMock.query.officialPermits.findMany).not.toHaveBeenCalled();
  });

  it("relinks the old and the new group when an approved update changes the site id and the operator", async () => {
    writeCombinedUpdatedReview(prepareCombinedUpdatedReview());
    dbMock.enqueueStationLinks([{ operatorId: 7, siteId: "PROPOSED-12" }], [{ operatorId: 8, siteId: "REVIEWED-12" }]);
    const { app, errors } = await createRouteHarnessWithErrors(reviewSubmission, reviewer);
    const response = await app.inject(approval);

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads().map(({ params }) => params)).toEqual([[12], [12]]);
    expect(correctedGroups()).toEqual([
      [
        { operatorId: 7, siteId: "PROPOSED-12" },
        { operatorId: 8, siteId: "REVIEWED-12" },
      ],
    ]);
    expect(dbMock.calls.findIndex(readsGroups)).toBeLessThan(dbMock.calls.findIndex(writes("update", "stations")));
    expectLinkedInsideTheWrite(writes("update", "stations"));
  });

  it("reads no group when an approved update only changes cells", async () => {
    writeUpdatedCellReview(prepareUpdatedCellReview(cellInputs.gsm));
    const { app, errors } = await createRouteHarnessWithErrors(reviewSubmission, reviewer);
    const response = await app.inject(approval);

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads()).toEqual([]);
    expect(correctedGroups()).toEqual([]);
  });

  it("links a station created through v1 before the request answers", async () => {
    const saved = stationRow({ status: "pending", location_id: 2 });
    const { structure_type: _type, structure_owner_id: _ownerId, structure_note: _note, ...location } = { ...readLocation.location, id: 2 };
    const operator = { id: 1, name: "Orange", full_name: "Orange Polska", parent_id: null, mnc: 26003, countryCode: "PL", brandId: null };
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("insert", "stations", [saved]);
    dbMock.query.stations.findFirst.mockResolvedValue({
      ...saved,
      cells: [],
      location,
      operator: { ...operator, shortCode: null, sortPriority: null },
    });
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    const { app, errors } = await createRouteHarnessWithErrors(postStationV1, admin);
    const response = await app.inject({
      method: "POST",
      url: "/stations",
      payload: { station_id: "A1", operator_id: 1, location_id: 2, cells: [] },
    });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(response.json().data).toMatchObject({ id: 1, station_id: "A1", operator_id: 1, location_id: 2, cells: [] });
    expect(correctedGroups()).toEqual([[A1]]);
    expectLinkedInsideTheWrite(writes("insert", "stations"));
  });

  it("relinks the old and the new group when a v1 edit changes the operator, and nothing for other fields", async () => {
    const current = stationRow();
    const saved = { ...current, operator_id: 2 };
    dbMock.query.stations.findFirst.mockResolvedValue(current);
    dbMock.query.cells.findMany.mockResolvedValue([]);
    scriptAudit();
    dbMock.enqueueFor("update", "stations", [saved]);
    const { app, errors } = await createRouteHarnessWithErrors(patchStationV1, admin);
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { operator_id: 2 } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(correctedGroups()).toEqual([[A1, { operatorId: 2, siteId: "A1" }]]);
    expectLinkedInsideTheWrite(writes("update", "stations"));
    expect(dbMock.query.cells.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ id: { in: [] } }, { station_id: 1 }] } }));

    dbMock.calls.length = 0;
    scriptAudit();
    dbMock.enqueueFor("update", "stations", [{ ...current, notes: "new", status: "inactive" }]);
    const second = await app.inject({ method: "PATCH", url: "/stations/1", payload: { notes: "new", status: "inactive" } });

    expect(second.statusCode, errors.map(String).join("\n") || second.body).toBe(200);
    expect(correctedGroups()).toEqual([]);
  });

  it("relinks the stations of a location whose coordinates change, and none when they stay", async () => {
    const row = { ...readLocation.location, id: 7 };
    const moved = { ...row, longitude: 21.25 };
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.query.stations.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    dbMock.enqueueFor("select", "locations", []);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("update", "locations", [moved]);
    dbMock.enqueueFor("update", "stations", []);
    dbMock.enqueueStationLinks([A1, { operatorId: 2, siteId: "B7" }]);
    dbMock.enqueueFor("select", "locations", [{ location: moved, region: { countryCode: "PL" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    const { app, errors } = await createRouteHarnessWithErrors(patchLocation, admin);
    const response = await app.inject({ method: "PATCH", url: "/locations/7", payload: { latitude: 52, longitude: 21.25 } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(groupReads()).toEqual([{ sql: '((false) or ("stations"."location_id" in ($1)))', params: [7] }]);
    expect(correctedGroups()).toEqual([[A1, { operatorId: 2, siteId: "B7" }]]);
    expectLinkedInsideTheWrite(writes("update", "locations"));

    dbMock.calls.length = 0;
    scriptAudit();
    dbMock.enqueueFor("update", "locations", [{ ...row, city: null }]);
    dbMock.enqueueFor("update", "stations", []);
    dbMock.enqueueFor("select", "locations", [{ location: { ...row, city: null }, region: { countryCode: "PL" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    const second = await app.inject({ method: "PATCH", url: "/locations/7", payload: { city: "" } });

    expect(second.statusCode, errors.map(String).join("\n") || second.body).toBe(200);
    expect(groupReads()).toEqual([]);
    expect(correctedGroups()).toEqual([]);
  });
});

describe("a revert relinks what it restored", () => {
  const tx = dbMock as unknown as DbTx;
  const audit: AuditRecorder = {
    operationId: 8,
    tx,
    entryMetadata: null,
    log: vi.fn(async () => undefined),
    logMany: vi.fn(async () => undefined),
    withEntryMetadata: () => audit,
  };

  function plan(entry: Pick<AuditEntry, "id" | "entity" | "op" | "record_id">, run: PlannedEntry["actions"][number]["run"]): PlannedEntry {
    return {
      entry: { operation_id: 7, station_id: 1, metadata: null, createdAt: readDate, old_values: null, new_values: null, ...entry },
      actions: [{ order: 32, run }],
      conflicts: [],
      dependencies: [],
      droppedFields: new Set(),
      effects: [],
      finalize: async () => undefined,
    };
  }

  it("reads the group of a station before it restores its site id, and corrects the old and the new group", async () => {
    const restored = plan({ id: 101, entity: "stations", op: "update", record_id: "1" }, async (client, state) => {
      await client.update(stations).set({ station_id: "A1" });
      state.affectedStationIds.add(1);
    });
    dbMock.enqueueStationLinks([{ operatorId: 1, siteId: "B2" }], [A1]);
    dbMock.enqueueFor("update", "stations", [], []);

    await applyRevertPlan(tx, audit, [restored], false);

    expect(groupReads().map(({ params }) => params)).toEqual([[1], [1]]);
    expect(dbMock.calls.findIndex(readsGroups)).toBeLessThan(dbMock.calls.findIndex(writes("update", "stations")));
    expect(dbMock.calls.findIndex(locksGroups)).toBeGreaterThan(dbMock.calls.findLastIndex(writes("update", "stations")));
    expect(correctedGroups()).toEqual([[{ operatorId: 1, siteId: "B2" }, A1]]);
  });

  it("corrects the groups of the stations at a location whose coordinates it restored", async () => {
    const restored = plan({ id: 102, entity: "locations", op: "update", record_id: "2" }, async (_client, state) => {
      state.touchedLocationIds.add(2);
    });
    dbMock.enqueueFor("select", "stations", [{ id: 1 }, { id: 5 }]);
    dbMock.enqueueFor("update", "stations", []);
    dbMock.enqueueStationLinks([A1, { operatorId: 2, siteId: "B7" }]);

    await applyRevertPlan(tx, audit, [restored], false);

    expect(groupReads()).toEqual([{ sql: '(("stations"."id" in ($1, $2)) or (false))', params: [1, 5] }]);
    expect(correctedGroups()).toEqual([[A1, { operatorId: 2, siteId: "B7" }]]);
  });

  it("corrects nothing when it only deactivates a station or restores cells", async () => {
    const deactivated = plan({ id: 103, entity: "stations", op: "create", record_id: "1" }, async (_client, state) => {
      state.affectedStationIds.add(1);
    });
    const cell = plan({ id: 104, entity: "cells", op: "update", record_id: "11" }, async (_client, state) => {
      state.affectedStationIds.add(1);
    });
    dbMock.enqueueFor("update", "stations", []);

    await applyRevertPlan(tx, audit, [deactivated, cell], false);

    expect(groupReads()).toEqual([]);
    expect(correctedGroups()).toEqual([]);
  });
});

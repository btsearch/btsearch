import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../../src/routes/v2/(put)/submissions/[id]/review.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { storedCell } from "../../../../../helpers/cellWriteFixtures.js";
import { injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { readDate } from "../../../../../helpers/readFixtures.js";
import { createRouteHarnessWithErrors } from "../../../../../helpers/routeHarness.js";
import { submissionId, submitterId } from "../../../../../helpers/submissionFixtures.js";
import {
  prepareCombinedUpdatedReview,
  prepareExistingPhotoReview,
  reviewReviewerId,
  writeCombinedUpdatedReview,
  writeExistingPhotoReview,
} from "../../../../../helpers/submissionReviewFixtures.js";
import { prepareLocationMove, writeLocationMove } from "../../../../../helpers/submissionReviewLocationFixtures.js";

const files = vi.hoisted(() => ({ unlink: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: files, ...files }));
const request = { method: "PUT" as const, url: `/submissions/${submissionId}/review`, payload: { decision: "approve" } };
const options = { session: userSession(reviewReviewerId, "admin") };
const dialect = new PgDialect();

function stationQueries(): unknown[][] {
  return dbMock.calls
    .filter((call) => call.operation === "select" && call.table === "stations")
    .flatMap((call) => (call.clauses.where?.[0] ? [dialect.sqlToQuery(call.clauses.where[0] as SQL).params] : []));
}

describe("submission approval relationships", () => {
  beforeEach(() => files.unlink.mockReset().mockResolvedValue(undefined));

  it.each([
    { move: "location" as const, existingTarget: false, orphaned: false },
    { move: "location" as const, existingTarget: true, orphaned: false },
    { move: "station" as const, existingTarget: false, orphaned: false },
    { move: "station" as const, existingTarget: false, orphaned: true },
    { move: "station" as const, existingTarget: true, orphaned: false },
    { move: "station" as const, existingTarget: true, orphaned: true },
  ])("applies the documented location move with %j", async ({ move, existingTarget, orphaned }) => {
    const scenario = prepareLocationMove(move, existingTarget);
    const { destinationId } = writeLocationMove(scenario, orphaned);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n") || response.body).toBe(200);
    expect(response.json().data.changes.location).toMatchObject({ latitude: 52.1, longitude: 21.2, move });
    const stationMoves = dbMock.calls.filter(
      (call) =>
        call.operation === "update" &&
        call.table === "stations" &&
        typeof call.values === "object" &&
        call.values !== null &&
        "location_id" in call.values,
    );
    const expectedStationIds: number[] = [];
    if (move === "station") expectedStationIds.push(12);
    else if (existingTarget) expectedStationIds.push(12, 13);
    expect(stationMoves.map((call) => call.values)).toEqual(expectedStationIds.map(() => expect.objectContaining({ location_id: destinationId })));
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "locations")).toBe(
      (move === "location" && existingTarget) || (move === "station" && orphaned),
    );
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "locations")).toBe(move === "station" && !existingTarget);
    if (move === "location" && !existingTarget) {
      expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "locations")?.values).toMatchObject({
        latitude: 52.1,
        longitude: 21.2,
      });
      expect(stationMoves).toHaveLength(0);
    }
    const auditRows = dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values);
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "submissions",
          new_values: expect.objectContaining({ status: "approved", reviewer_id: reviewReviewerId }),
        }),
      ]),
    );
    if (stationMoves.length > 0)
      expect(auditRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity: "stations",
            op: "update",
            old_values: expect.objectContaining({ location_id: 2 }),
            new_values: expect.objectContaining({ location_id: destinationId }),
            metadata: { submission_id: submissionId },
          }),
        ]),
      );
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      actor_id: submitterId,
      performed_by: reviewReviewerId,
    });
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it("merges a whole location's two residents and shared photo selections into an existing target, preserving pending submission picks", async () => {
    const scenario = prepareLocationMove("location", true);
    const { originalPhoto } = writeLocationMove(scenario, false, true);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(
      dbMock.calls.filter((call) => call.operation === "insert" && call.table === "station_photo_selections").map((call) => call.values),
    ).toEqual([
      { station_id: 12, location_photo_id: 100, is_main: true },
      { station_id: 13, location_photo_id: 100, is_main: true },
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "submission_location_photo_selections")?.values).toMatchObject([
      { submission_id: submissionId, location_photo_id: 100, is_main: true },
    ]);
    expect(whereQuery("locations", "delete").params).toEqual([2]);
    expect(whereQuery("location_photos", "delete").params).toEqual([90]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation_id: 9,
          entity: "location_photos",
          op: "delete",
          record_id: "90",
          old_values: originalPhoto,
          metadata: { from_location_id: 2, to_location_id: 3 },
        }),
        expect.objectContaining({
          entity: "station_photo_selections",
          old_values: [{ location_photo_id: 90, is_main: true }],
          new_values: [{ location_photo_id: 100, is_main: true }],
          metadata: { submission_id: submissionId },
        }),
        expect.objectContaining({ entity: "locations", op: "delete", record_id: "2", metadata: { submission_id: submissionId } }),
      ]),
    );
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "attachments")).toBe(false);
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it.each([false, true])("synchronizes a same-location partner's sectors and follows its cells; already in sync=%s", async (inSync) => {
    const scenario = prepareCombinedUpdatedReview();
    writeCombinedUpdatedReview(scenario, {
      siblingStationId: 13,
      ...(inSync
        ? {}
        : {
            siblingAssignedCells: [
              { id: 41, sectorId: 17 },
              { id: 42, sectorId: 15 },
            ],
          }),
    });
    const previous = inSync
      ? [
          { id: 15, azimuth: 180 },
          { id: 16, azimuth: 270 },
        ]
      : [
          { id: 15, azimuth: 90 },
          { id: 16, azimuth: 0 },
          { id: 17, azimuth: 270 },
        ];
    const next = [
      { id: 15, azimuth: 180 },
      { id: 16, azimuth: 270 },
    ];
    dbMock.enqueueFor("select", "station_sectors", previous, ...(inSync ? [] : [next]));
    if (!inSync) {
      const oldCell = storedCell({ rat: "gsm", bandId: 1, lac: 9, cid: 9, sectorId: 17 }, 41, 13);
      const nextCell = { ...oldCell, cell: { ...oldCell.cell, sector_id: 16 } };
      const flatten = (row: typeof oldCell) => ({ ...row.cell, gsm: row.gsm, umts: row.umts, lte: row.lte, nr: row.nr });
      dbMock.query.cells.findMany
        .mockReset()
        .mockResolvedValueOnce([flatten(scenario.currentGsm), flatten(scenario.deletedNr)])
        .mockResolvedValueOnce([flatten(oldCell)])
        .mockResolvedValueOnce([flatten(nextCell)])
        .mockResolvedValue([flatten(scenario.nextGsm), flatten(scenario.addedLte)]);
      dbMock.enqueueFor("update", "station_sectors", [], [], []);
      dbMock.enqueueFor("update", "cells", []);
      dbMock.enqueueFor("delete", "station_sectors", []);
      dbMock.enqueueFor("insert", "audit_logs", [], []);
      dbMock.enqueueFor("update", "stations", []);
    }
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n") || response.body).toBe(200);
    expect(stationQueries()).toContainEqual([2, 26003]);
    const auditRows = dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values);
    if (inSync) expect(auditRows).not.toEqual(expect.arrayContaining([expect.objectContaining({ entity: "station_sectors", station_id: 13 })]));
    else {
      expect(auditRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity: "station_sectors",
            station_id: 13,
            old_values: previous,
            new_values: next,
            metadata: { submission_id: submissionId },
          }),
          expect.objectContaining({
            entity: "cells",
            station_id: 13,
            record_id: "41",
            old_values: expect.objectContaining({ sector_id: 17 }),
            new_values: expect.objectContaining({ sector_id: 16 }),
            metadata: { submission_id: submissionId },
          }),
        ]),
      );
      expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "cells").map((call) => call.values)).toContainEqual({
        sector_id: 16,
        updatedAt: expect.any(Date),
      });
    }
  });

  it.each([false, true])("shares uploaded photo selections with the same-location operator partner; explicit main=%s", async (explicitMain) => {
    const scenario = prepareExistingPhotoReview();
    const oldSibling = { station_id: 13, location_photo_id: 99, is_main: true };
    const photo = {
      id: 100,
      location_id: 2,
      attachment_id: 8,
      submission_id: submissionId,
      uploaded_by: submitterId,
      note: "Partner tower",
      taken_at: readDate,
      createdAt: readDate,
    };
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([
      { id: 7, submission_id: submissionId, attachment_id: 8, note: photo.note, taken_at: readDate, is_main: explicitMain, createdAt: readDate },
    ]);
    dbMock.query.stationPhotoSelections.findFirst.mockImplementation(async (input) =>
      (input as { where: { station_id: number } }).where.station_id === 13 ? oldSibling : undefined,
    );
    writeExistingPhotoReview(scenario, [], [{ station_id: 12, location_photo_id: 100, is_main: true }], 1, {
      siteMnc: 26002,
      siblingStationId: 13,
      siblingOld: [oldSibling],
      siblingNew: [
        { ...oldSibling, is_main: !explicitMain },
        { station_id: 13, location_photo_id: 100, is_main: explicitMain },
      ],
    });
    dbMock.enqueueFor("select", "location_photos", []);
    dbMock.enqueueFor("insert", "location_photos", [photo]);
    dbMock.enqueueFor("insert", "station_photo_selections", [], []);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
    if (explicitMain) dbMock.enqueueFor("update", "station_photo_selections", [], [], [], []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(stationQueries()).toContainEqual([2, 26003]);
    expect(
      dbMock.calls.filter((call) => call.operation === "insert" && call.table === "station_photo_selections").map((call) => call.values),
    ).toEqual([[{ station_id: 12, location_photo_id: 100, is_main: true }], [{ station_id: 13, location_photo_id: 100, is_main: explicitMain }]]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "station_photo_selections",
          station_id: 13,
          old_values: [{ location_photo_id: 99, is_main: true }],
          new_values: [
            { location_photo_id: 99, is_main: !explicitMain },
            { location_photo_id: 100, is_main: explicitMain },
          ],
          metadata: { submission_id: submissionId },
        }),
      ]),
    );
  });

  it.each([
    { main: true, orphaned: true, attachmentShared: false, lastPhoto: false },
    { main: false, orphaned: false, attachmentShared: true, lastPhoto: false },
    { main: true, orphaned: true, attachmentShared: true, lastPhoto: false },
    { main: true, orphaned: true, attachmentShared: false, lastPhoto: true },
  ])("applies selected-photo removal with main and attachment retention rules %j", async ({ main, orphaned, attachmentShared, lastPhoto }) => {
    const scenario = prepareExistingPhotoReview();
    const uuid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const photo = {
      id: 90,
      location_id: 2,
      attachment_id: 8,
      submission_id: submissionId,
      uploaded_by: submitterId,
      note: "Removed caption",
      taken_at: readDate,
      createdAt: readDate,
    };
    const previous = [
      { station_id: 12, location_photo_id: 90, is_main: main },
      ...(!lastPhoto ? [{ station_id: 12, location_photo_id: 91, is_main: !main }] : []),
    ];
    const next = lastPhoto ? [] : [{ station_id: 12, location_photo_id: 91, is_main: true }];
    dbMock.query.submissionLocationPhotoSelections.findMany.mockResolvedValue([
      { id: 1, submission_id: submissionId, location_photo_id: 90, is_main: false, is_removal: true, createdAt: readDate },
    ]);
    writeExistingPhotoReview(scenario, previous, next, 0, {
      photoSelectionChecks: [main ? [{ id: 7 }] : [], ...(main ? [lastPhoto ? [] : [{ id: 8 }]] : [])],
    });
    dbMock.enqueueFor("delete", "station_photo_selections", []);
    if (main && !lastPhoto) dbMock.enqueueFor("update", "station_photo_selections", []);
    dbMock.enqueueFor("select", "location_photos", orphaned ? [{ photo }] : []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    if (orphaned) {
      dbMock.enqueueFor("delete", "location_photos", []);
      dbMock.enqueueFor("select", "location_photos", attachmentShared ? [{ attachment_id: 8 }] : []);
      dbMock.enqueueFor("insert", "audit_logs", []);
      if (!attachmentShared) {
        dbMock.enqueueFor("select", "attachments", [{ uuid }]);
        dbMock.enqueueFor("delete", "attachments", []);
      }
    }
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(whereQuery("station_photo_selections", "delete").params).toEqual([12, 90]);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "station_photo_selections")).toBe(main && !lastPhoto);
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "location_photos")).toBe(orphaned);
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "attachments")).toBe(orphaned && !attachmentShared);
    expect(
      files.unlink.mock.calls
        .map(([path]) => String(path).replaceAll("\\", "/").split("/").at(-1))
        .sort((left, right) => (left ?? "").localeCompare(right ?? "")),
    ).toEqual(orphaned && !attachmentShared ? [`${uuid}.full.avif`, `${uuid}.thumb.webp`, `${uuid}.webp`] : []);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "station_photo_selections",
          old_values: previous.map(({ station_id: _stationId, ...selection }) => selection),
          new_values: next.map(({ station_id: _stationId, ...selection }) => selection),
          metadata: { submission_id: submissionId },
        }),
      ]),
    );
  });
});

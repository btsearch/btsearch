import type { NewCellInput } from "@openbts/shared/contract";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../../src/routes/v2/(put)/submissions/[id]/review.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { cellInputs, radioTables, storedCell } from "../../../../../helpers/cellWriteFixtures.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { readDate } from "../../../../../helpers/readFixtures.js";
import { createRouteHarnessWithErrors } from "../../../../../helpers/routeHarness.js";
import { submissionId, submitterId } from "../../../../../helpers/submissionFixtures.js";
import {
  prepareCombinedUpdatedReview,
  prepareExistingPhotoReview,
  prepareNewReview,
  prepareUpdatedCellReview,
  reviewReviewerId,
  writeCombinedUpdatedReview,
  writeExistingPhotoReview,
  writeNewReview,
  writeUpdatedCellReview,
} from "../../../../../helpers/submissionReviewFixtures.js";

const request = { method: "PUT" as const, url: `/submissions/${submissionId}/review`, payload: { decision: "approve" } };
const options = { session: userSession(reviewReviewerId, "admin") };
const reviewedInputs: NewCellInput[] = [
  { rat: "gsm", bandId: 1, lac: 10, cid: 20, isEGsm: true, bsic: 63 },
  { rat: "umts", bandId: 2, rnc: 10, cid: 20, lac: 30, psc: 511, uarfcn: 10612 },
  { rat: "lte", bandId: 3, enbid: 200, clid: 2, tac: 42, pci: 503, earfcn: 1650, supportsIot: true },
  { rat: "nr", bandId: 4, mode: "sa", gnbid: 100, clid: 2, tac: 42, pci: 1007, arfcn: 630000, supportsRedCap: true },
];
const reviewedDetails = {
  gsm: { lac: 10, cid: 20, e_gsm: true, bsic: 63 },
  umts: { rnc: 10, cid: 20, lac: 30, psc: 511, arfcn: 10612 },
  lte: { enbid: 200, clid: 2, tac: 42, pci: 503, earfcn: 1650, supports_iot: true },
  nr: { type: "sa", gnbid: 100, clid: 2, nrtac: 42, pci: 1007, arfcn: 630000, supports_nr_redcap: true, gnbid_length: undefined },
};

describe("submission approval application", () => {
  it("reviews a valid historical persisted sector list with nullable operation flags through v2", async () => {
    const initial = prepareNewReview([cellInputs.gsm]);
    const scenario = { ...initial, proposedSectors: initial.proposedSectors.map((sector) => ({ ...sector, operation: null })) };
    dbMock.query.proposedSectors.findMany.mockResolvedValue(scenario.proposedSectors);
    writeNewReview(scenario);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.changes.sectors).toMatchObject([{ action: null, key: "front", azimuth: 90 }]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "cells")?.values).toMatchObject({ sector_id: 5 });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "station_sectors")?.values).toEqual({
      station_id: 12,
      azimuth: 90,
    });
  });
  it("applies all four technologies in one proposal while preserving shared sector references and independent radio details", async () => {
    const inputs = Object.values(cellInputs).map((input) => ({ ...input, isConfirmed: true, notes: `${input.rat} observation` }));
    const scenario = prepareNewReview(inputs, { submitter: true });
    writeNewReview(scenario, { reviewNote: "Verified all radios" });
    const response = await injectMutation(route, { ...request, payload: { decision: "approve", note: "Verified all radios" } }, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.changes.cells).toEqual(
      inputs.map((input) => expect.objectContaining({ action: "create", rat: input.rat, notes: `${input.rat} observation`, sectorKey: "front" })),
    );
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "cells").map((call) => call.values)).toEqual(
      inputs.map((input) =>
        expect.objectContaining({
          station_id: 12,
          sector_id: 5,
          rat: input.rat.toUpperCase(),
          is_confirmed: true,
          notes: `${input.rat} observation`,
        }),
      ),
    );
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining(
        inputs.map((input, index) =>
          expect.objectContaining({
            operation_id: 9,
            entity: "cells",
            op: "create",
            record_id: String(31 + index),
            new_values: expect.objectContaining({ rat: input.rat.toUpperCase(), notes: `${input.rat} observation` }),
            metadata: { submission_id: submissionId },
          }),
        ),
      ),
    );
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      actor_id: submitterId,
      performed_by: reviewReviewerId,
    });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values).toMatchObject({
      status: "approved",
      reviewer_id: reviewReviewerId,
      review_notes: "Verified all radios",
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "notifications")?.values).toMatchObject({
      userId: submitterId,
      type: "submission_approved",
      submissionId,
      stationId: 12,
      pushQueuedAt: expect.any(Date),
      metadata: {
        reviewer_name: "Reviewer",
        reviewer_note: "Verified all radios",
        station_id: "PROPOSED-12",
        station_operator_name: "Operator",
        station_operator_mnc: 7,
      },
    });
  });

  it.each([
    { withLocation: false, withSector: false },
    { withLocation: true, withSector: false },
    { withLocation: false, withSector: true },
  ])("approves an empty cell proposal with optional components %j as a station awaiting cells", async (components) => {
    const scenario = prepareNewReview([], components);
    writeNewReview(scenario);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "stations")?.values).toMatchObject({
      status: "pending",
      location_id: components.withLocation ? 2 : null,
    });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "cells")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "locations")).toBe(components.withLocation);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "station_sectors")).toBe(components.withSector);
    expect(dbMock.calls.some((call) => call.table === "location_photos")).toBe(false);
  });

  it.each([
    { input: cellInputs.gsm, duplicate: { lac: 1, cid: 2 }, message: "A GSM cell with LAC 1 and CID 2 already exists for this operator" },
    { input: cellInputs.umts, duplicate: { rnc: 1, cid: 2 }, message: "A UMTS cell with RNC 1 and CID 2 already exists for this operator" },
    { input: cellInputs.lte, duplicate: { enbid: 100, clid: 1 }, message: "An LTE cell with eNBID 100 and CLID 1 already exists for this operator" },
  ])("refuses an already occupied $input.rat identity before writing any approval entities", async ({ input, duplicate, message }) => {
    prepareNewReview([input], { duplicate: { rat: input.rat, rows: [duplicate] } });
    expectError(await injectMutation(route, request, options), 409, "DUPLICATE_ENTRY", message);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(whereQuery(getTableName(radioTables[input.rat]), "select").params).toContain(7);
  });

  it.each([
    { fixture: { bandRat: "UMTS" }, message: "Band 1 is for UMTS cells, not GSM" },
    { fixture: { plannedBandId: null }, message: "Band 1 is not in the band plan of PL" },
  ])("preserves the band and country-plan approval error: $message", async ({ fixture, message }) => {
    const scenario = prepareNewReview([cellInputs.gsm], { submitter: true });
    writeNewReview(scenario, fixture);
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", message);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "submissions")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "notifications")).toBe(false);
  });

  it("stamps the submission's country when approval gives a new station proposal its station", async () => {
    const scenario = prepareNewReview([], { withSector: false });
    writeNewReview(scenario);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ stationId: 12, countryCode: "PL" });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "submissions").map((call) => call.values)).toEqual([
      expect.objectContaining({ status: "approved", station_id: 12 }),
      { country_code: "PL" },
    ]);
  });

  it("keeps the stored country when approval leaves the submission's station as it was", async () => {
    const scenario = prepareUpdatedCellReview(cellInputs.gsm);
    writeUpdatedCellReview(scenario);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "submissions")).toHaveLength(1);
  });

  it("does not impose a country plan when the stored station has no country", async () => {
    const scenario = prepareNewReview([cellInputs.gsm], { withLocation: false, withSector: false });
    writeNewReview(scenario, { countryCode: null, plannedBandId: null });
    expect((await injectMutation(route, request, options)).statusCode).toBe(200);
  });

  it("stops a combined proposal when a later cell insert returns no created row", async () => {
    const scenario = prepareNewReview([cellInputs.gsm, cellInputs.lte], { submitter: true });
    writeNewReview(scenario, { failCellAt: 1 });
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_CREATE", "Failed to create cell");
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "cells")).toHaveLength(2);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === getTableName(radioTables.lte))).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "submissions")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "notifications")).toBe(false);
  });

  it.each([
    { lock: [], code: "NOT_FOUND", status: 404, message: undefined },
    { lock: [{ status: "approved" }], code: "CONFLICT", status: 409, message: "This submission has already been reviewed" },
    { lock: [{ status: "rejected" }], code: "CONFLICT", status: 409, message: "This submission has already been reviewed" },
    {
      lock: [{ updatedAt: new Date("2026-01-02T00:00:00Z") }],
      code: "CONFLICT",
      status: 409,
      message: "This submission was changed after you opened it",
    },
  ])("rechecks pending review state under the row lock: $code $message", async ({ lock, code, status, message }) => {
    const scenario = prepareNewReview([cellInputs.gsm]);
    writeNewReview(scenario, { lock: lock.map((changes) => ({ ...scenario.submission, ...changes })) });
    expectError(await injectMutation(route, request, options), status, code, message);
    expect(dbMock.calls.some((call) => call.operation === "insert" && ["stations", "locations", "cells"].includes(call.table ?? ""))).toBe(false);
  });

  it.each(["approved", "rejected"])("cannot apply an already %s submission for a second time", async (status) => {
    const scenario = prepareNewReview([cellInputs.gsm]);
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...scenario.submission, status });
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Only pending submissions can be approved");
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.query.proposedCells.findMany).not.toHaveBeenCalled();
  });

  it("refuses a stale client version before applying a valid composite draft", async () => {
    const scenario = prepareNewReview([cellInputs.nr]);
    writeNewReview(scenario);
    expectError(
      await injectMutation(route, { ...request, payload: { decision: "approve", expectedUpdatedAt: "2025-12-31T00:00:00Z" } }, options),
      409,
      "CONFLICT",
      "This submission was changed after you opened it",
    );
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "stations")).toBe(false);
  });

  it.each([
    { explicitMain: false, existingMain: false, expectedMain: [true, false] },
    { explicitMain: true, existingMain: false, expectedMain: [false, true] },
    { explicitMain: false, existingMain: true, expectedMain: [false, false] },
    { explicitMain: true, existingMain: true, expectedMain: [false, true] },
  ])("publishes uploaded photo metadata and applies main-photo rules %j", async ({ explicitMain, existingMain, expectedMain }) => {
    const existingScenario = existingMain ? prepareExistingPhotoReview() : undefined;
    const newScenario = existingScenario === undefined ? prepareNewReview([cellInputs.gsm], { submitter: true }) : undefined;
    const uploaded = [
      { id: 7, submission_id: submissionId, attachment_id: 8, note: "Northern sector", taken_at: readDate, is_main: false, createdAt: readDate },
      { id: 9, submission_id: submissionId, attachment_id: 10, note: null, taken_at: null, is_main: explicitMain, createdAt: readDate },
    ];
    const published = uploaded.map((photo, index) => ({
      id: 100 + index,
      location_id: 2,
      attachment_id: photo.attachment_id,
      submission_id: submissionId,
      uploaded_by: submitterId,
      note: photo.note,
      taken_at: photo.taken_at,
      createdAt: readDate,
    }));
    const oldSelection = { station_id: 12, location_photo_id: 99, is_main: true };
    const previous = existingMain ? [oldSelection] : [];
    const after = [
      ...previous.map((selection) => ({ ...selection, is_main: !explicitMain })),
      ...published.map((photo, index) => ({ station_id: 12, location_photo_id: photo.id, is_main: expectedMain[index]! })),
    ];
    dbMock.query.submissionPhotos.findMany.mockResolvedValue(uploaded);
    dbMock.query.stationPhotoSelections.findFirst.mockResolvedValue(existingMain ? oldSelection : undefined);
    if (existingScenario) writeExistingPhotoReview(existingScenario, previous, after, 2);
    else if (newScenario) writeNewReview(newScenario, { beforePhotos: previous, afterPhotos: after, photoCount: 2 });
    dbMock.enqueueFor("select", "location_photos", []);
    dbMock.enqueueFor("insert", "location_photos", [...published].reverse());
    dbMock.enqueueFor("insert", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
    if (explicitMain) dbMock.enqueueFor("update", "station_photo_selections", [], []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.changes.photos.uploadedCount).toBe(2);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "location_photos")?.values).toEqual(
      uploaded.map((photo) => ({
        location_id: 2,
        attachment_id: photo.attachment_id,
        submission_id: submissionId,
        uploaded_by: submitterId,
        note: photo.note,
        taken_at: photo.taken_at,
      })),
    );
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "station_photo_selections")?.values).toEqual(
      published.map((photo, index) => ({ station_id: 12, location_photo_id: photo.id, is_main: expectedMain[index] })),
    );
    expect(
      dbMock.calls.filter((call) => call.operation === "update" && call.table === "station_photo_selections").map((call) => call.values),
    ).toEqual(explicitMain ? [{ is_main: false }, { is_main: true }] : []);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([
        ...published.map((photo) =>
          expect.objectContaining({
            operation_id: 9,
            entity: "location_photos",
            op: "create",
            record_id: String(photo.id),
            new_values: photo,
            metadata: { submission_id: submissionId },
          }),
        ),
        expect.objectContaining({
          entity: "station_photo_selections",
          op: "update",
          station_id: 12,
          old_values: previous.map(({ station_id: _stationId, ...selection }) => selection),
          new_values: expect.arrayContaining(after.map(({ station_id: _stationId, ...selection }) => selection)),
          metadata: { submission_id: submissionId },
        }),
      ]),
    );
  });

  it("reuses a published location photo for an uploaded attachment without duplicating the photo or its provenance", async () => {
    const scenario = prepareNewReview([], { withSector: false });
    const uploaded = {
      id: 7,
      submission_id: submissionId,
      attachment_id: 8,
      note: "Draft note",
      taken_at: readDate,
      is_main: true,
      createdAt: readDate,
    };
    const existing = {
      id: 100,
      location_id: 2,
      attachment_id: 8,
      submission_id: null,
      uploaded_by: submitterId,
      note: "Original caption",
      taken_at: readDate,
      createdAt: readDate,
    };
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([uploaded]);
    dbMock.query.stationPhotoSelections.findFirst.mockResolvedValue(undefined);
    writeNewReview(scenario, { afterPhotos: [{ station_id: 12, location_photo_id: 100, is_main: true }], photoCount: 1 });
    dbMock.enqueueFor("select", "location_photos", [existing]);
    dbMock.enqueueFor("insert", "station_photo_selections", []);
    dbMock.enqueueFor("update", "station_photo_selections", [], []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "location_photos")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "location_photos")).toBe(false);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "station_photo_selections")?.values).toEqual([
      { station_id: 12, location_photo_id: 100, is_main: true },
    ]);
  });

  it("approves one update containing location and station edits, sector add/update/delete and cell add/update/delete", async () => {
    const scenario = prepareCombinedUpdatedReview();
    writeCombinedUpdatedReview(scenario);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n") || response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      action: "update",
      status: "accepted",
      changes: {
        station: { siteId: "REVIEWED-12", operatorId: 8, notes: "Reviewed site" },
        location: { city: "Reviewed city", address: null },
        sectors: [
          { action: "update", id: 5, azimuth: 180 },
          { action: "create", key: "rear", azimuth: 270 },
          { action: "delete", id: 6 },
        ],
        cells: [
          { action: "update", id: 31, notes: "Reviewed cell" },
          { action: "create", rat: "lte", sectorKey: "rear" },
          { action: "delete", id: 33 },
        ],
      },
    });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "locations")?.values).toMatchObject({
      city: "Reviewed city",
      address: null,
    });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "stations")?.values).toMatchObject({
      station_id: "REVIEWED-12",
      operator_id: 8,
      notes: "Reviewed site",
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "cells")?.values).toMatchObject({
      sector_id: 7,
      rat: "LTE",
      station_id: 12,
    });
    expect(whereQuery("cells", "delete").params).toEqual([33]);
    expect(whereQuery("station_sectors", "delete").params).toEqual([6]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "locations",
          op: "update",
          old_values: expect.objectContaining({ city: "Łódź", address: "Main Street 1" }),
          new_values: expect.objectContaining({ city: "Reviewed city", address: null }),
          metadata: { submission_id: submissionId },
        }),
        expect.objectContaining({
          entity: "stations",
          op: "update",
          old_values: expect.objectContaining({ station_id: "PROPOSED-12", operator_id: 7 }),
          new_values: expect.objectContaining({ station_id: "REVIEWED-12", operator_id: 8 }),
          metadata: { submission_id: submissionId },
        }),
        expect.objectContaining({
          entity: "station_sectors",
          op: "update",
          old_values: [
            { id: 5, azimuth: 90 },
            { id: 6, azimuth: 0 },
          ],
          new_values: [
            { id: 5, azimuth: 180 },
            { id: 7, azimuth: 270 },
          ],
          metadata: { submission_id: submissionId },
        }),
        expect.objectContaining({
          entity: "cells",
          op: "update",
          record_id: "31",
          old_values: expect.objectContaining({ notes: "Live note" }),
          new_values: expect.objectContaining({ notes: "Reviewed cell" }),
        }),
        expect.objectContaining({
          entity: "cells",
          op: "create",
          record_id: "32",
          new_values: expect.objectContaining({ sector_id: 7, rat: "LTE" }),
        }),
        expect.objectContaining({ entity: "cells", op: "delete", record_id: "33", old_values: expect.objectContaining({ sector_id: 6, rat: "NR" }) }),
      ]),
    );
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      actor_id: submitterId,
      performed_by: reviewReviewerId,
      kind: "submission.approve",
    });
  });

  it("refuses an update whose proposed site and operator are already occupied", async () => {
    const scenario = prepareCombinedUpdatedReview();
    writeCombinedUpdatedReview(scenario, { duplicateStation: true });
    expectError(
      await injectMutation(route, request, options),
      400,
      "BAD_REQUEST",
      "A station with the proposed station ID and operator already exists",
    );
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "stations")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "submissions")).toBe(false);
    expect(whereQuery("stations", "select").params).toEqual(["REVIEWED-12", 8, 12]);
  });

  it("refuses removal of a sector while an undeleted cell still references it", async () => {
    const scenario = prepareCombinedUpdatedReview();
    writeCombinedUpdatedReview(scenario, { occupiedDeletedSector: true });
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Cannot delete sectors that still have cells assigned");
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "station_sectors")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "submissions")).toBe(false);
  });

  it.each(["missing", "other station", "changed technology"])("refuses an existing cell proposal when its target is %s", async (condition) => {
    const scenario = prepareUpdatedCellReview(cellInputs.gsm);
    writeUpdatedCellReview(scenario);
    const target = condition === "changed technology" ? storedCell(cellInputs.umts, 31, 12) : scenario.current;
    const rows =
      condition === "missing"
        ? []
        : [
            {
              ...target.cell,
              station_id: condition === "other station" ? 99 : 12,
              gsm: target.gsm,
              umts: target.umts,
              lte: target.lte,
              nr: target.nr,
            },
          ];
    dbMock.query.cells.findMany.mockReset().mockResolvedValue(rows);
    const message =
      condition === "missing"
        ? "Target cell 31 not found"
        : condition === "other station"
          ? "Target cell 31 is on another station"
          : "A cell's technology cannot be changed; cell 31 is UMTS, not GSM";
    expectError(
      await injectMutation(route, request, options),
      condition === "missing" ? 404 : 409,
      condition === "missing" ? "NOT_FOUND" : "CONFLICT",
      message,
    );
    expect(dbMock.calls.some((call) => call.operation === "update" && ["cells", "submissions"].includes(call.table ?? ""))).toBe(false);
  });

  it("cannot approve a cell write whose post-write snapshot cannot be loaded", async () => {
    const scenario = prepareNewReview([cellInputs.gsm]);
    writeNewReview(scenario);
    dbMock.query.cells.findMany.mockResolvedValue([]);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE", "Failed to load cell 31 after approval");
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "submissions")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "notifications")).toBe(false);
  });

  it.each([false, true])(
    "resolves a selected photo from another location while retaining original metadata; existing copy=%s",
    async (existingCopy) => {
      const scenario = prepareNewReview([], { withSector: false });
      const previousSubmission = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const original = {
        id: 90,
        location_id: 1,
        attachment_id: 8,
        submission_id: previousSubmission,
        uploaded_by: submitterId,
        note: "Original caption",
        taken_at: readDate,
        createdAt: readDate,
      };
      const copy = { ...original, id: 100, location_id: 2 };
      const selection = { id: 1, submission_id: submissionId, location_photo_id: 90, is_main: true, is_removal: false, createdAt: readDate };
      dbMock.query.submissionLocationPhotoSelections.findMany.mockResolvedValue([selection]);
      dbMock.query.stationPhotoSelections.findFirst.mockResolvedValue(undefined);
      writeNewReview(scenario, { photoSelectionChecks: [[]], afterPhotos: [{ station_id: 12, location_photo_id: 100, is_main: true }] });
      dbMock.enqueueFor("select", "location_photos", [original], existingCopy ? [{ id: 100 }] : []);
      if (!existingCopy) {
        dbMock.enqueueFor("insert", "location_photos", [copy]);
        dbMock.enqueueFor("insert", "audit_logs", []);
      }
      dbMock.enqueueFor("insert", "station_photo_selections", []);
      dbMock.enqueueFor("insert", "audit_logs", []);
      const response = await injectMutation(route, request, options);
      expect(response.statusCode, response.body).toBe(200);
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "station_photo_selections")?.values).toEqual([
        { station_id: 12, location_photo_id: 100, is_main: true },
      ]);
      const created = dbMock.calls.find((call) => call.operation === "insert" && call.table === "location_photos");
      if (existingCopy) expect(created).toBeUndefined();
      else
        expect(created?.values).toEqual({
          location_id: 2,
          attachment_id: 8,
          submission_id: previousSubmission,
          uploaded_by: submitterId,
          note: "Original caption",
          taken_at: readDate,
        });
    },
  );

  it("keeps an explicitly main uploaded photo ahead of a selected existing main-photo proposal", async () => {
    const scenario = prepareNewReview([], { withSector: false, submitter: true });
    const upload = { id: 7, submission_id: submissionId, attachment_id: 8, note: null, taken_at: null, is_main: true, createdAt: readDate };
    const published = {
      id: 100,
      location_id: 2,
      attachment_id: 8,
      submission_id: submissionId,
      uploaded_by: submitterId,
      note: null,
      taken_at: null,
      createdAt: readDate,
    };
    const picked = { ...published, id: 101, attachment_id: 9 };
    dbMock.query.submissionPhotos.findMany.mockResolvedValue([upload]);
    dbMock.query.submissionLocationPhotoSelections.findMany.mockResolvedValue([
      { id: 1, submission_id: submissionId, location_photo_id: 101, is_main: true, is_removal: false, createdAt: readDate },
    ]);
    dbMock.query.stationPhotoSelections.findFirst.mockResolvedValue(undefined);
    writeNewReview(scenario, {
      photoCount: 1,
      photoSelectionChecks: [[]],
      afterPhotos: [
        { station_id: 12, location_photo_id: 100, is_main: true },
        { station_id: 12, location_photo_id: 101, is_main: false },
      ],
    });
    dbMock.enqueueFor("select", "location_photos", [], [picked]);
    dbMock.enqueueFor("insert", "location_photos", [published]);
    dbMock.enqueueFor("insert", "station_photo_selections", [], []);
    dbMock.enqueueFor("update", "station_photo_selections", [], []);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(
      dbMock.calls.filter((call) => call.operation === "insert" && call.table === "station_photo_selections").map((call) => call.values),
    ).toEqual([[{ station_id: 12, location_photo_id: 100, is_main: true }], [{ station_id: 12, location_photo_id: 101, is_main: false }]]);
    expect(
      dbMock.calls.filter((call) => call.operation === "update" && call.table === "station_photo_selections").map((call) => call.values),
    ).toEqual([{ is_main: false }, { is_main: true }]);
  });
  it.each(Object.values(cellInputs))(
    "publishes a new station's $rat proposal with its location, resolved sector and audit provenance",
    async (input) => {
      const scenario = prepareNewReview([input]);
      writeNewReview(scenario);
      const { app, errors } = await createRouteHarnessWithErrors(route, options);
      const response = await app.inject(request);
      expect(response.statusCode, errors.map((error) => error.stack).join("\n") || response.body).toBe(200);
      expect(response.json().data).toMatchObject({
        action: "create",
        status: "accepted",
        stationId: 12,
        changes: {
          station: { siteId: "PROPOSED-12" },
          cells: [{ action: "create", rat: input.rat }],
          sectors: [{ action: "create", key: "front", azimuth: 90 }],
        },
      });
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "stations")?.values).toMatchObject({
        station_id: "PROPOSED-12",
        operator_id: 7,
        location_id: 2,
        status: "published",
        is_confirmed: true,
      });
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "cells")?.values).toMatchObject({
        station_id: 12,
        sector_id: 5,
        rat: input.rat.toUpperCase(),
        band_id: input.bandId,
      });
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === getTableName(radioTables[input.rat]))?.values).toMatchObject({
        cell_id: 31,
      });
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
        kind: "submission.approve",
        actor_id: null,
        performed_by: reviewReviewerId,
        metadata: { submission_id: submissionId, type: "new" },
      });
      expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entity: "stations", op: "create", record_id: "12", metadata: { submission_id: submissionId } }),
          expect.objectContaining({ entity: "locations", op: "create", record_id: "2", metadata: { submission_id: submissionId } }),
          expect.objectContaining({
            entity: "station_sectors",
            op: "update",
            station_id: 12,
            new_values: [{ id: 5, azimuth: 90 }],
            metadata: { submission_id: submissionId },
          }),
          expect.objectContaining({ entity: "cells", op: "create", record_id: "31", metadata: { submission_id: submissionId } }),
          expect.objectContaining({
            entity: "submissions",
            op: "update",
            record_id: submissionId,
            new_values: expect.objectContaining({ status: "approved", station_id: 12 }),
          }),
        ]),
      );
    },
  );

  it.each(reviewedInputs)("applies an existing $rat cell proposal without changing its technology, sector or confirmation", async (input) => {
    Object.assign(getRuntimeSettings(), { bsicEnabled: true, pscEnabled: true });
    const scenario = prepareUpdatedCellReview(input);
    writeUpdatedCellReview(scenario);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n") || response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      action: "update",
      status: "accepted",
      stationId: 12,
      changes: { cells: [{ action: "update", id: 31, rat: input.rat, notes: "Reviewed note" }] },
    });
    const values = dbMock.calls.find((call) => call.operation === "update" && call.table === "cells")?.values;
    expect(values).toMatchObject({ band_id: input.bandId, notes: "Reviewed note", updatedAt: expect.any(Date) });
    expect(values).not.toHaveProperty("rat");
    expect(values).not.toHaveProperty("sector_id");
    expect(values).not.toHaveProperty("is_confirmed");
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === getTableName(radioTables[input.rat]))?.values).toMatchObject({
      ...reviewedDetails[input.rat],
      updatedAt: expect.any(Date),
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      {
        entity: "cells",
        op: "update",
        record_id: "31",
        old_values: { notes: "Live note", sector_id: 5, is_confirmed: true },
        new_values: { notes: "Reviewed note", sector_id: 5, is_confirmed: true },
        metadata: { submission_id: submissionId },
      },
    ]);
  });

  it("approves removal of the last cell and changes its station to awaiting cells", async () => {
    const scenario = prepareUpdatedCellReview(cellInputs.gsm, "delete");
    writeUpdatedCellReview(scenario);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n") || response.body).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "stations")?.values).toMatchObject({ status: "pending" });
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "stations",
          old_values: expect.objectContaining({ status: "published" }),
          new_values: expect.objectContaining({ status: "pending" }),
        }),
        expect.objectContaining({
          entity: "cells",
          op: "delete",
          record_id: "31",
          old_values: expect.objectContaining({ notes: "Live note" }),
          metadata: { submission_id: submissionId },
        }),
      ]),
    );
  });
});

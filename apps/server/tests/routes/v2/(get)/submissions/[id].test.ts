import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(get)/submissions/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";
import { photoId, photoRow } from "../../../../helpers/photoFixtures.js";
import { readStation } from "../../../../helpers/readFixtures.js";
import { scriptSubmissionSerialization, submissionRow, submitterId } from "../../../../helpers/submissionFixtures.js";
import {
  type ReadTarget,
  foreignReaderId,
  proposalDate,
  proposedCell,
  proposedLocation,
  proposedStation,
  scriptReaderAccess,
  scriptSubmissionRead,
  scriptSubmissionReadTargets,
} from "../../../../helpers/submissionReadFixtures.js";

const request = { method: "GET" as const, url: "/submissions/11111111-1111-4111-8111-111111111111" };
const options = { session: userSession(submitterId) };

describe("GET /submissions/11111111-1111-4111-8111-111111111111", () => {
  it.each([
    { bsicEnabled: false, pscEnabled: false },
    { bsicEnabled: true, pscEnabled: false },
    { bsicEnabled: false, pscEnabled: true },
    { bsicEnabled: true, pscEnabled: true },
  ])(
    "projects draft changes, privacy, sentinels and photo announcements with BSIC=$bsicEnabled/PSC=$pscEnabled",
    async ({ bsicEnabled, pscEnabled }) => {
      getRuntimeSettings().bsicEnabled = bsicEnabled;
      getRuntimeSettings().pscEnabled = pscEnabled;
      authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
      dbMock.enqueueFor("select", "submissions", [
        {
          ...submissionRow,
          type: "update",
          status: "approved",
          origin: "analyzer",
          station_id: 1,
          reviewer_id: foreignReaderId,
          reviewed_at: proposalDate,
          pending_photos: 3,
          submitter_note: "Submitter note",
          review_notes: "Accepted changes",
        },
      ]);
      const gsm = { ...proposedCell(), gsm: { lac: 0, cid: 65535, e_gsm: null, bsic: 63 } };
      const umts = {
        ...proposedCell({ id: 2, operation: "update", target_cell_id: 11, rat: "UMTS", notes: null }),
        umts: { lac: 0, rnc: 0, cid: 0, psc: 511, arfcn: 0 },
      };
      const lte = {
        ...proposedCell({
          id: 3,
          operation: "update",
          target_cell_id: 12,
          rat: "LTE",
          notes: "",
          band_id: 99,
          sector_local_id: null,
          sector_unassigned: true,
        }),
        lte: { tac: 0, enbid: 0, clid: 0, pci: 0, earfcn: 0, supports_iot: null },
      };
      const nr = {
        ...proposedCell({ id: 4, rat: "NR" }),
        nr: { type: "nsa" as const, nrtac: null, gnbid: 0, gnbid_length: 24, clid: null, pci: 0, arfcn: 0, supports_nr_redcap: null },
      };
      const knownUmts = { ...proposedCell({ id: 5, rat: "UMTS" }), umts: { lac: null, rnc: 1, cid: 0, psc: null, arfcn: null } };
      const knownLte = { ...proposedCell({ id: 6, rat: "LTE" }), lte: { tac: null, enbid: 1, clid: 0, pci: null, earfcn: null, supports_iot: true } };
      const deletion = proposedCell({ id: 7, operation: "delete", target_cell_id: 14, rat: null, notes: null, band_id: null, type: null });
      const selected = {
        ...photoRow({ authorId: foreignReaderId, authorName: "Private photographer", authorVisibility: "private" }),
        submissionId: submissionRow.id,
        isMain: true,
        isRemoval: false,
      };
      const removed = { ...selected, fileId: foreignReaderId, isRemoval: true, isMain: false, hasThumb: false, hasFull: true };
      scriptSubmissionRead({
        stationRows: [proposedStation],
        locationRows: [proposedLocation],
        cellRows: [gsm, umts, lte, nr, knownUmts, knownLte, deletion],
        sectorRows: [
          {
            id: 1,
            submission_id: submissionRow.id,
            operation: "add",
            target_sector_id: null,
            local_id: "north",
            azimuth: 0,
            createdAt: proposalDate,
            updatedAt: proposalDate,
          },
          {
            id: 2,
            submission_id: submissionRow.id,
            operation: "update",
            target_sector_id: 8,
            local_id: "sector-8",
            azimuth: 359,
            createdAt: proposalDate,
            updatedAt: proposalDate,
          },
          {
            id: 3,
            submission_id: submissionRow.id,
            operation: null,
            target_sector_id: 9,
            local_id: "sector-9",
            azimuth: 360,
            createdAt: proposalDate,
            updatedAt: proposalDate,
          },
          {
            id: 4,
            submission_id: submissionRow.id,
            operation: "delete",
            target_sector_id: 10,
            local_id: "sector-10",
            azimuth: 90,
            createdAt: proposalDate,
            updatedAt: proposalDate,
          },
        ],
        pickRows: [selected, removed],
        uploadRows: [{ submissionId: submissionRow.id, total: 2 }],
        userRows: [
          { id: submitterId, username: "owner", name: "Owner name", image: null, profileVisibility: "private" },
          { id: foreignReaderId, username: "reviewer", name: "Private reviewer", image: null, profileVisibility: "private" },
        ],
      });
      dbMock.enqueueFor("select", "cells", [{ id: 11, notes: "Live note" }]);
      const response = await injectMutation(route, request, options);
      expect(response.statusCode, response.body).toBe(200);
      const data = response.json().data;
      expect(data).toMatchObject({
        action: "update",
        status: "accepted",
        origin: "analyzer",
        stationId: 1,
        note: "Submitter note",
        reviewNote: "Accepted changes",
        reviewedAt: proposalDate.toISOString(),
        submitter: { name: "Owner name" },
        reviewer: { name: null },
      });
      expect(data).not.toHaveProperty("station");
      expect(data.changes.station).toEqual({
        siteId: "Draft site",
        operatorId: 7,
        notes: null,
        identifiers: [
          { kind: "networksId", value: "0" },
          { kind: "networksName", value: null },
          { kind: "operatorName", value: "Draft name" },
        ],
        backhaul: { medium: "microwave", speedMbps: 100, model: null },
      });
      expect(data.changes.location).toEqual({
        regionId: 1,
        city: null,
        address: "Draft address",
        latitude: 52,
        longitude: 21,
        move: "location",
        structure: { type: "rooftopMast", ownerId: null, ownerName: "New owner", note: null },
      });
      expect(data.changes.sectors).toEqual([
        { action: "create", id: null, key: "north", azimuth: 0 },
        { action: "update", id: 8, key: "sector-8", azimuth: 359 },
        { action: null, id: 9, key: "sector-9", azimuth: null },
        { action: "delete", id: 10, key: "sector-10", azimuth: 90 },
      ]);
      expect(data.changes.cells).toMatchObject([
        { action: "create", rat: "gsm", lac: 0, cid: 65535, isEGsm: false, bsic: bsicEnabled ? 63 : null, sectorKey: "north", isConfirmed: false },
        { action: "update", rat: "umts", rnc: null, cid: null, psc: pscEnabled ? 511 : null, uarfcn: 0, notes: "Live note" },
        {
          action: "update",
          rat: "lte",
          enbid: null,
          clid: null,
          tac: 0,
          pci: 0,
          earfcn: 0,
          bandId: null,
          supportsIot: false,
          notes: null,
          isSectorCleared: true,
        },
        { action: "create", rat: "nr", mode: "nsa", gnbid: null, supportsRedCap: false },
        { rat: "umts", rnc: 1, cid: 0 },
        { rat: "lte", enbid: 1, clid: 0, supportsIot: true },
        { action: "delete", id: 14, rat: null },
      ]);
      expect(data.changes.cells[6]).not.toHaveProperty("lac");
      expect(data.changes.cells[6]).not.toHaveProperty("mode");
      expect(data.changes.photos).toMatchObject({
        announcedCount: 3,
        uploadedCount: 2,
        selected: [{ id: photoId, isMain: true, author: { name: null }, urls: { thumb: `/uploads/${photoId}.thumb.webp` } }],
        removed: [{ id: foreignReaderId, author: { name: null }, urls: { full: `/uploads/${foreignReaderId}.full.avif` } }],
      });
      expect(data.changes.photos.removed[0]).not.toHaveProperty("isMain");
      expect(dbMock.calls.every((call) => call.operation === "select")).toBe(true);
    },
  );

  it.each([
    {
      name: "explicit clear",
      station: { ...proposedStation, changed_fields: ["notes", "uplink_type"] as typeof proposedStation.changed_fields, uplink_type: null },
      expected: { notes: null, backhaul: null },
    },
    {
      name: "legacy populated fields",
      station: {
        ...proposedStation,
        changed_fields: null,
        station_id: null,
        operator_id: null,
        networks_id: null,
        mno_name: null,
        uplink_type: null,
        uplink_model: null,
      },
      expected: { backhaul: { speedMbps: 100 } },
    },
    { name: "no changed fields", station: { ...proposedStation, changed_fields: [] }, expected: {} },
  ])("keeps $name distinct from omitted proposal fields", async ({ station, expected }) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptSubmissionRead({ stationRows: [station] });
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.changes.station).toEqual(expected);
  });

  it.each(["visible", "hidden", "unplaced"])("includes the %s station without losing the submission", async (visibility) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const countryCode = visibility === "visible" ? "PL" : visibility === "hidden" ? "DE" : null;
    const stationId = visibility === "unplaced" ? null : 1;
    dbMock.enqueueFor("select", "submissions", [{ ...submissionRow, station_id: stationId, country_code: countryCode }]);
    scriptSubmissionRead();
    if (visibility !== "unplaced") {
      dbMock.enqueueFor("select", "countries", visibility === "hidden" ? [{ code: "DE" }] : []);
      dbMock.enqueueFor("select", "stations", visibility === "visible" ? [readStation] : []);
    }
    if (visibility === "visible") dbMock.enqueueFor("select", "extra_identificators", []);
    const response = await injectMutation(route, { ...request, url: `${request.url}?include=station` }, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.station).toEqual(
      visibility === "visible" ? expect.objectContaining({ id: 1, siteId: readStation.station_id, status: "active" }) : null,
    );
    expect(response.json().data.countryCode).toBe(countryCode);
    if (visibility === "hidden") expect(whereQuery("stations", "select").params).toContain("DE");
    if (visibility === "unplaced") expect(dbMock.calls.some((call) => call.table === "stations")).toBe(false);
  });

  it.each(["user", "admin"] as const)("reads a foreign submission as %s only with staff reach", async (role) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: role === "admin" });
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    if (role === "admin") {
      scriptReaderAccess("admin");
      scriptSubmissionRead({ accessLoaded: true });
    }
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId, role) });
    if (role === "user") {
      expectError(response, 404, "NOT_FOUND");
      expect(dbMock.calls.some((call) => call.table === "proposed_cells")).toBe(false);
    } else {
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.id).toBe(submissionRow.id);
    }
  });

  it.each(["station", "location", "cell", "photo", "operator"] as ReadTarget[])(
    "allows an editor to read when the touched %s is covered",
    async (kind) => {
      dbMock.enqueueFor("select", "submissions", [submissionRow]);
      scriptReaderAccess("editor", kind === "operator");
      scriptSubmissionReadTargets(kind, true, kind === "station");
      scriptSubmissionRead({ accessLoaded: true });
      const response = await injectMutation(route, request, { session: userSession(foreignReaderId, "editor") });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.id).toBe(submissionRow.id);
      expect(dbMock.pendingResults()).toBe(0);
    },
  );

  it("hides a foreign submission wholly outside an editor's grants", async () => {
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptReaderAccess("editor");
    scriptSubmissionReadTargets("station", false);
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId, "editor") });
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.table === "submission_photos")).toBe(false);
  });

  it("requires whole-country editor reach for a foreign new station proposed without a location", async () => {
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptReaderAccess("editor");
    scriptSubmissionReadTargets("operator", true);
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId, "editor") });
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.table === "submission_photos")).toBe(false);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("preserves a reviewed submission after its submitter and reviewer accounts are deleted", async () => {
    dbMock.enqueueFor("select", "submissions", [
      {
        ...submissionRow,
        submitter_id: null,
        reviewer_id: null,
        type: "delete",
        status: "rejected",
        reviewed_at: proposalDate,
        submitter_note: "Original note",
        review_notes: "Kept review",
      },
    ]);
    scriptReaderAccess("admin");
    scriptSubmissionRead({ accessLoaded: true, hasUsers: false });
    const response = await injectMutation(route, request, { session: userSession(foreignReaderId, "admin") });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      action: "delete",
      status: "rejected",
      submitter: null,
      reviewer: null,
      note: "Original note",
      reviewNote: "Kept review",
      reviewedAt: proposalDate.toISOString(),
      changes: { station: null, location: null, sectors: [], cells: [], photos: { announcedCount: 0, uploadedCount: 0, selected: [], removed: [] } },
    });
    expect(dbMock.calls.filter((call) => call.table === "users")).toHaveLength(1);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("projects a standalone NR proposal with known zero-valued cell and radio identifiers", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    const nr = {
      ...proposedCell({ rat: "NR", type: "PICOCELL", is_confirmed: true }),
      nr: { type: "sa" as const, nrtac: 0, gnbid: 123, gnbid_length: 24, clid: 0, pci: 0, arfcn: 0, supports_nr_redcap: true },
    };
    scriptSubmissionRead({ cellRows: [nr] });
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.changes.cells).toMatchObject([
      { rat: "nr", mode: "sa", cellType: "pico", isConfirmed: true, tac: 0, gnbid: 123, clid: 0, pci: 0, arfcn: 0, supportsRedCap: true },
    ]);
    expect(response.json().data.changes.cells[0]).not.toHaveProperty("enbid");
  });

  it.each(["include=station.cells", "unknown=true"])("rejects unsupported detail projections: %s", async (query) => {
    const response = await injectMutation(route, { ...request, url: `${request.url}?${query}` }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("requires authentication before accessing submissions", async () => {
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns FEATURE_DISABLED when submissions are disabled", async () => {
    getRuntimeSettings().submissionsEnabled = false;
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns 404 when the submission is absent", async () => {
    dbMock.enqueueFor("select", "submissions", []);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it("returns the owner's submission with its real serialized status", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptSubmissionSerialization();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { id: submissionRow.id, action: "create", status: "pending", note: null, reviewNote: "Earlier note" },
    });
  });
});

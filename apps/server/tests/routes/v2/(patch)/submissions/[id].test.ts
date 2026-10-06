import type { SubmissionUpdate } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(patch)/submissions/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { cellBands } from "../../../../helpers/cellWriteFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";
import { createRouteHarnessWithErrors } from "../../../../helpers/routeHarness.js";
import { stationRow } from "../../../../helpers/stationFixtures.js";
import {
  draftFixture,
  draftLocation,
  draftRadios,
  draftStation,
  existingContentDraft,
  existingDraftFixture,
  liveDraftBackhaul,
  liveDraftIdentifiers,
  liveDraftStation,
  scriptDraftSerialization,
  scriptDraftUpdate,
} from "../../../../helpers/submissionDraftFixtures.js";
import { scriptCountryStamp, scriptSubmissionSerialization, submissionRow, submitterId } from "../../../../helpers/submissionFixtures.js";
import { submissionPhotoId, submissionPhotoView } from "../../../../helpers/submissionPhotoFixtures.js";

const request = { method: "PATCH" as const, url: "/submissions/11111111-1111-4111-8111-111111111111", payload: { note: "Updated note" } };
const options = { session: userSession(submitterId) };

describe("PATCH /submissions/11111111-1111-4111-8111-111111111111", () => {
  it("removes obsolete station and location proposals when replacement content matches live data", async () => {
    const fixture = existingContentDraft();
    const previous = {
      ...fixture.snapshot,
      proposedStation: { ...draftStation, station_id: "WRONG", notes: "Wrong notes", changed_fields: ["station_id", "notes"] },
      proposedLocation: { ...draftLocation, address: "Wrong address", changed_fields: ["address"] },
    };
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValueOnce(fixture.row).mockResolvedValueOnce(previous).mockResolvedValueOnce(fixture.snapshot);
    const body = {
      station: {
        siteId: "SITE-LIVE",
        operatorId: 7,
        notes: "Live notes",
        identifiers: [
          { kind: "networksId", value: "123" },
          { kind: "networksName", value: "Live Network" },
          { kind: "operatorName", value: "Live Operator" },
        ],
        backhaul: { medium: "microwave", speedMbps: 1000, model: "Live Router" },
      },
      location: {
        regionId: 1,
        latitude: 52,
        longitude: 21,
        city: "Warsaw",
        address: "Example 1",
        structure: { type: "mast", ownerId: 9, note: "Live structure" },
      },
    } satisfies SubmissionUpdate;
    dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
    dbMock.enqueueFor("select", "regions", [{ id: 1 }], [{ countryCode: "PL" }], [{ countryCode: "PL", regionId: 1 }]);
    dbMock.enqueueFor("select", "structure_owners", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "stations", [{ stationId: 1, region_id: 1, latitude: 52, longitude: 21 }], [{ countryCode: "PL", regionId: 1 }]);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.query.stations.findFirst.mockResolvedValue(liveDraftStation);
    dbMock.query.extraIdentificators.findFirst.mockResolvedValue(liveDraftIdentifiers);
    dbMock.query.stationUplinks.findFirst.mockResolvedValue(liveDraftBackhaul);
    dbMock.query.proposedLocations.findFirst.mockResolvedValue(previous.proposedLocation);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ status: "pending", updatedAt: fixture.row.updatedAt }]);
    dbMock.enqueueFor("update", "submissions", []);
    dbMock.enqueueFor("delete", "proposed_stations", []);
    dbMock.enqueueFor("delete", "proposed_locations", []);
    scriptCountryStamp({ stationId: 1 });
    dbMock.enqueueFor("select", "submissions", [fixture.row]);
    scriptDraftSerialization(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.changes).toMatchObject({ station: null, location: null, cells: [], sectors: [] });
    expect(
      dbMock.calls
        .filter((call) => call.operation === "delete")
        .map((call) => call.table)
        .sort((left, right) => (left ?? "").localeCompare(right ?? "")),
    ).toEqual(["proposed_locations", "proposed_stations"]);
    expect(dbMock.calls.some((call) => call.operation === "insert" && ["proposed_stations", "proposed_locations"].includes(call.table ?? ""))).toBe(
      false,
    );
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      {
        old_values: { proposedStation: { station_id: "WRONG" }, proposedLocation: { address: "Wrong address" } },
        new_values: { proposedStation: null, proposedLocation: null },
      },
    ]);
    expect(dbMock.calls.findLast((call) => call.operation === "update" && call.table === "submissions")?.values).toEqual({ country_code: "PL" });
  });

  it.each([false, true])(
    "allows a foreign editor to edit a moving-station draft only when all targets are covered: %s",
    async (coversDestination) => {
      const editorId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const fixture = draftFixture([]);
      fixture.row = { ...fixture.row, type: "update", station_id: 1, submitter_note: "Updated note" };
      const initial = { ...fixture.row, submitter_note: "Old evidence" };
      fixture.sectors = [];
      fixture.snapshot = {
        ...fixture.snapshot,
        ...fixture.row,
        proposedStation: null,
        proposedLocation: {
          ...fixture.snapshot.proposedLocation!,
          region_id: 2,
          latitude: 53,
          longitude: 22,
          changed_fields: ["region_id", "latitude", "longitude"],
        },
        proposedSectors: [],
      };
      const oldSnapshot = { ...fixture.snapshot, ...initial };
      dbMock.query.submissions.findFirst.mockResolvedValueOnce(initial);
      dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
      const grant = { countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 1 };
      dbMock.enqueueFor("select", "role_grants", coversDestination ? [grant, { ...grant, regionId: 2 }] : [grant]);
      dbMock.enqueueFor("select", "submissions", [{ stationId: 1 }]);
      dbMock.enqueueFor("select", "proposed_stations", [], []);
      dbMock.enqueueFor("select", "proposed_locations", [
        { region_id: 2, latitude: 53, longitude: 22, current: { region_id: 1, latitude: 52, longitude: 21 } },
      ]);
      for (const table of ["proposed_cells", "proposed_sectors", "submission_location_photo_selections"]) dbMock.enqueueFor("select", table, []);
      dbMock.enqueueFor("select", "locations", []);
      dbMock.enqueueFor("execute", undefined, [{ regionId: 2 }]);
      dbMock.enqueueFor("select", "regions", [{ countryCode: "PL", regionId: 2 }]);
      dbMock.enqueueFor("select", "stations", [{ countryCode: "PL", regionId: 1 }]);
      if (coversDestination) {
        dbMock.query.submissions.findFirst.mockResolvedValueOnce(oldSnapshot).mockResolvedValueOnce(fixture.snapshot);
        scriptAudit();
        dbMock.enqueueFor("select", "submissions", [{ status: "pending", updatedAt: initial.updatedAt }], [fixture.row]);
        dbMock.enqueueFor("update", "submissions", []);
        scriptDraftSerialization(fixture, "editor");
      }
      const { app, errors } = await createRouteHarnessWithErrors(route, { session: userSession(editorId, "editor") });
      const response = await app.inject(request);
      if (coversDestination) {
        expect(errors).toEqual([]);
        expect(response.statusCode).toBe(200);
        expect(response.json().data).toMatchObject({
          note: "Updated note",
          submitter: null,
          changes: { location: { regionId: 2, latitude: 53, longitude: 22 } },
        });
        expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values).toMatchObject({
          submitter_note: "Updated note",
        });
      } else {
        expectError(response, 403, "FORBIDDEN");
        expect(dbMock.transaction).not.toHaveBeenCalled();
      }
    },
  );

  it("replaces an existing station's cell proposals with a mixed add, sparse update, and removal", async () => {
    const radios = [draftRadios[0], draftRadios[2], draftRadios[3]];
    const { fixture, targets } = existingDraftFixture(radios);
    fixture.cells[0]!.cell = { ...fixture.cells[0]!.cell, operation: "add", target_cell_id: null, notes: "Radio evidence" };
    fixture.cells[2] = {
      ...fixture.cells[2]!,
      cell: { ...fixture.cells[2]!.cell, operation: "delete", notes: "Stored evidence" },
      gsm: null,
      umts: null,
      lte: null,
      nr: null,
    };
    fixture.snapshot.proposedCells = fixture.cells.map(({ cell, ...radio }) => ({ ...cell, ...radio }));
    const body = {
      cells: [draftRadios[0].input, { action: "update", id: 101, notes: null }, { action: "delete", id: 102 }],
    } satisfies SubmissionUpdate;
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const old = { ...fixture.snapshot, proposedCells: [fixture.snapshot.proposedCells[0]!] };
    dbMock.query.submissions.findFirst.mockResolvedValueOnce(fixture.row).mockResolvedValueOnce(old).mockResolvedValueOnce(fixture.snapshot);
    dbMock.enqueueFor("select", "cells", targets.slice(1));
    dbMock.enqueueFor("select", "bands", [{ id: 1 }], cellBands, []);
    dbMock.enqueueFor("select", "stations", [{ countryCode: "PL", regionId: 1 }], [{ locationCountry: "PL", operatorCountry: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.query.stations.findFirst.mockResolvedValue(stationRow({ operator_id: 7 }));
    dbMock.query.stationSectors.findMany.mockResolvedValue([]);
    dbMock.query.proposedSectors.findMany.mockResolvedValue([]);
    dbMock.query.cells.findMany.mockResolvedValue(targets.slice(1).map(({ cell }) => cell));
    dbMock.query.proposedLocations.findFirst.mockResolvedValue(undefined);
    dbMock.query.proposedStations.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "gsm_cells", []);
    dbMock.enqueueFor("select", "lte_cells", [], []);
    dbMock.enqueueFor("select", "country_bands", [{ bandId: 1 }, { bandId: 3 }]);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ status: "pending", updatedAt: fixture.row.updatedAt }], [fixture.row]);
    dbMock.enqueueFor("update", "submissions", []);
    dbMock.enqueueFor("delete", "proposed_cells", []);
    dbMock.enqueueFor(
      "insert",
      "proposed_cells",
      fixture.cells.map(({ cell }) => ({ id: cell.id })),
    );
    dbMock.enqueueFor("insert", "proposed_gsm_cells", []);
    dbMock.enqueueFor("insert", "proposed_lte_cells", []);
    scriptDraftSerialization(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.changes.cells).toMatchObject([
      { action: "create", rat: "gsm", id: null, lac: 65535, cid: 0 },
      { action: "update", rat: "lte", id: 101, enbid: 1048575, clid: 255, notes: null },
      { action: "delete", rat: "nr", id: 102 },
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_cells")?.values).toMatchObject([
      { operation: "add" },
      { operation: "update", target_cell_id: 101, notes: "" },
      { operation: "delete", target_cell_id: 102 },
    ]);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "proposed_nr_cells")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation !== "select" && call.table === "cells")).toBe(false);
  });

  it.each([false, true])("replaces photo picks with main selection %s and preserves announced and uploaded counts", async (selectsMain) => {
    const fixture = draftFixture([draftRadios[0]]);
    fixture.row.pending_photos = 3;
    fixture.snapshot.pending_photos = 3;
    const photos = selectsMain ? { selectIds: [submissionPhotoId], mainPhotoId: submissionPhotoId } : { selectIds: [] };
    dbMock.enqueueFor("select", "proposed_locations", [{ latitude: 52, longitude: 21 }]);
    if (selectsMain) {
      dbMock.enqueueFor("select", "location_photos", [{ id: 70, fileId: submissionPhotoId, locationId: 2 }]);
      dbMock.enqueueFor("select", "locations", [{ id: 2 }]);
      dbMock.enqueueFor("insert", "submission_location_photo_selections", []);
      dbMock.enqueueFor("update", "submission_photos", []);
    }
    dbMock.enqueueFor("delete", "submission_location_photo_selections", []);
    dbMock.enqueueFor(
      "select",
      "submission_location_photo_selections",
      selectsMain ? [{ ...submissionPhotoView, submissionId: fixture.row.id, isMain: true, isRemoval: false }] : [],
    );
    dbMock.enqueueFor("select", "submission_photos", [{ submissionId: fixture.row.id, total: 2 }]);
    scriptDraftUpdate(fixture, { photos }, { old: fixture });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: { photos } });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.changes.photos).toMatchObject({
      announcedCount: 3,
      uploadedCount: 2,
      selected: selectsMain ? [{ id: submissionPhotoId, isMain: true }] : [],
      removed: [],
    });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values).not.toHaveProperty("pending_photos");
    const uploadedMainUpdate = dbMock.calls.find((call) => call.operation === "update" && call.table === "submission_photos");
    if (selectsMain) {
      expect(uploadedMainUpdate?.values).toEqual({ is_main: false });
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "submission_location_photo_selections")?.values).toEqual([
        { submission_id: fixture.row.id, location_photo_id: 70, is_main: true, is_removal: false },
      ]);
    } else expect(uploadedMainUpdate).toBeUndefined();
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["submission_location_photo_selections"]);
  });

  it("allows the owner to clear the evidence note of a pending station deletion draft", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const initial = { ...submissionRow, station_id: 1, type: "delete", submitter_note: "Old evidence" };
    const updated = { ...initial, submitter_note: null };
    const snapshot = { ...initial, proposedStation: null, proposedLocation: null, proposedSectors: [], proposedCells: [] };
    dbMock.query.submissions.findFirst
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, ...updated });
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ status: "pending", updatedAt: initial.updatedAt }], [updated]);
    dbMock.enqueueFor("update", "submissions", []);
    scriptSubmissionSerialization();
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: { note: null } });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ action: "delete", stationId: 1, note: null, status: "pending" });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values).toMatchObject({ submitter_note: null });
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation !== "select" && call.table === "stations")).toBe(false);
  });

  it("clears explicitly null station notes, identifiers, and backhaul while retaining omitted location and radio parts", async () => {
    const fixture = draftFixture([draftRadios[0]]);
    fixture.row.submitter_note = null;
    fixture.snapshot.submitter_note = null;
    fixture.snapshot.proposedStation = {
      ...fixture.snapshot.proposedStation!,
      notes: null,
      networks_id: null,
      networks_name: null,
      mno_name: null,
      uplink_type: null,
      uplink_speed: null,
      uplink_model: null,
    };
    const body = {
      note: null,
      station: { siteId: "SITE-7", operatorId: 7, notes: null, identifiers: [{ kind: "networksId", value: null }], backhaul: null },
    } satisfies SubmissionUpdate;
    scriptDraftUpdate(fixture, body);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_stations")?.values).toMatchObject({
      notes: null,
      networks_id: null,
      uplink_type: null,
      uplink_speed: null,
      uplink_model: null,
    });
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["proposed_stations"]);
    expect(response.json().data).toMatchObject({ note: null, changes: { location: fixture.input.location, cells: [{ rat: "gsm" }] } });
  });

  it.each(draftRadios)("replaces the $rat radio proposal and leaves omitted station and location proposals intact", async (radio) => {
    const fixture = draftFixture([radio]);
    const body = { cells: fixture.input.cells };
    scriptDraftUpdate(fixture, body);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.changes).toMatchObject({
      station: fixture.input.station,
      location: { ...fixture.input.location, move: "station" },
      sectors: [{ key: "north" }, { key: "south" }],
      cells: [{ ...radio.input, sectorKey: "north", isConfirmed: false }],
    });
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["proposed_cells"]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === radio.table)?.values).toMatchObject({
      proposed_cell_id: 40,
      ...Object.fromEntries(Object.entries(radio.details).filter(([, value]) => value !== null)),
    });
  });

  it.each(["user", "admin"] as const)("replaces all draft content and keeps cell confirmation only for %s", async (role) => {
    const previous = draftFixture([draftRadios[0]]);
    previous.row.pending_photos = 3;
    previous.snapshot.pending_photos = 3;
    const fixture = draftFixture();
    fixture.row.pending_photos = 3;
    fixture.snapshot.pending_photos = 3;
    for (const cell of fixture.cells) cell.cell.is_confirmed = role === "admin";
    for (const cell of fixture.snapshot.proposedCells) cell.is_confirmed = role === "admin";
    const body = {
      station: fixture.input.station,
      location: fixture.input.location,
      sectors: fixture.input.sectors,
      cells: fixture.input.cells?.map((cell) => ({ ...cell, isConfirmed: true })),
    };
    scriptDraftUpdate(fixture, body, { old: previous, role });
    const { app, errors } = await createRouteHarnessWithErrors(route, { session: userSession(submitterId, role) });
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.changes).toMatchObject({
      station: fixture.input.station,
      location: { ...fixture.input.location, move: "station" },
      sectors: [
        { key: "north", azimuth: 0 },
        { key: "south", azimuth: 180 },
      ],
      cells: draftRadios.map((radio, index) => ({ rat: radio.rat, sectorKey: index % 2 === 0 ? "north" : "south", isConfirmed: role === "admin" })),
      photos: { announcedCount: 3, uploadedCount: 0 },
    });
    expect(
      dbMock.calls
        .filter((call) => call.operation === "delete")
        .map((call) => call.table)
        .sort((left, right) => (left ?? "").localeCompare(right ?? "")),
    ).toEqual(["proposed_cells", "proposed_locations", "proposed_sectors", "proposed_stations"]);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values).not.toHaveProperty("pending_photos");
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_cells")?.values).toMatchObject(
      draftRadios.map((radio) => ({ rat: radio.rat.toUpperCase(), is_confirmed: role === "admin" })),
    );
  });

  it("clears explicitly empty sector and cell arrays while preserving every omitted proposal part", async () => {
    const previous = draftFixture();
    const fixture = draftFixture([]);
    fixture.sectors = [];
    fixture.snapshot.proposedSectors = [];
    const body = { sectors: [], cells: [] };
    scriptDraftUpdate(fixture, body, { old: previous });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.changes).toMatchObject({ station: fixture.input.station, location: fixture.input.location, sectors: [], cells: [] });
    expect(
      dbMock.calls
        .filter((call) => call.operation === "delete")
        .map((call) => call.table)
        .sort((left, right) => (left ?? "").localeCompare(right ?? "")),
    ).toEqual(["proposed_cells", "proposed_sectors"]);
    expect(dbMock.calls.some((call) => call.operation === "insert" && ["proposed_cells", "proposed_sectors"].includes(call.table ?? ""))).toBe(false);
  });

  it.each([
    { description: "omitted owner", structure: undefined, ownerId: null, ownerName: "Original Owner" },
    { description: "cleared owner", structure: { ownerId: null }, ownerId: null, ownerName: null },
    { description: "listed replacement", structure: { ownerId: 99 }, ownerId: 99, ownerName: null },
    { description: "unchanged proposal", structure: { ownerName: "Original Owner" }, ownerId: null, ownerName: "Original Owner" },
  ] as const)("allows $description while new owner proposals are disabled", async ({ structure, ownerId, ownerName }) => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const previous = draftFixture([draftRadios[0]]);
    previous.snapshot.proposedLocation = { ...draftLocation, structure_owner_name: "Original Owner" };
    const fixture = draftFixture([draftRadios[0]]);
    fixture.snapshot.proposedLocation = {
      ...draftLocation,
      address: "Changed address",
      structure_owner_id: ownerId,
      structure_owner_name: ownerName,
    };
    const body = {
      location: {
        regionId: 1,
        latitude: 52,
        longitude: 21,
        city: "Warsaw",
        address: "Changed address",
        ...(structure === undefined ? {} : { structure }),
      },
    } satisfies SubmissionUpdate;
    scriptDraftUpdate(fixture, body, { old: previous, lookupRetainedOwner: structure === undefined });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    const inserted = dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values;
    expect(inserted).toMatchObject({ structure_owner_id: ownerId });
    if (ownerName !== null) expect(inserted).toMatchObject({ structure_owner_name: ownerName });
    else expect(inserted).not.toMatchObject({ structure_owner_name: "Original Owner" });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
  });

  it("retains the unchanged proposed name when a location moves between regions of the same country", async () => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const previous = draftFixture([draftRadios[0]]);
    previous.snapshot.proposedLocation = { ...draftLocation, structure_owner_name: "Original Owner" };
    const fixture = draftFixture([draftRadios[0]]);
    fixture.snapshot.proposedLocation = { ...draftLocation, region_id: 2, structure_owner_name: "Original Owner" };
    const body = {
      location: { regionId: 2, latitude: 52, longitude: 21, city: "Warsaw", address: "Example 1", structure: { ownerName: "Original Owner" } },
    } satisfies SubmissionUpdate;
    scriptDraftUpdate(fixture, body, { old: previous, retainedOwnerRegions: [{ id: 1, countryCode: "PL" }, { id: 2, countryCode: "PL" }] });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values).toMatchObject({
      region_id: 2,
      structure_owner_name: "Original Owner",
    });
  });

  it("resolves an existing named owner while new owner proposals are disabled", async () => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const previous = draftFixture([draftRadios[0]]);
    previous.snapshot.proposedLocation = { ...draftLocation, structure_owner_name: "Original Owner" };
    const fixture = draftFixture([draftRadios[0]]);
    fixture.snapshot.proposedLocation = { ...draftLocation, address: "Changed address", structure_owner_id: 99 };
    const body = {
      location: { regionId: 1, latitude: 52, longitude: 21, address: "Changed address", structure: { ownerName: "Existing Owner" } },
    } satisfies SubmissionUpdate;
    dbMock.enqueueFor("select", "structure_owners", [{ id: 99, name: "Existing Owner", countryCode: "PL", brandId: null, operatorId: null }]);
    scriptDraftUpdate(fixture, body, { old: previous });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    const inserted = dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values;
    expect(inserted).toMatchObject({ structure_owner_id: 99 });
    expect(inserted).not.toMatchObject({ structure_owner_name: "Original Owner" });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
  });

  it("rejects moving an omitted pending owner proposal into another country while proposals are disabled", async () => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const previous = draftFixture([draftRadios[0]]);
    previous.snapshot.proposedLocation = { ...draftLocation, structure_owner_name: "Original Owner" };
    const body = { location: { regionId: 2, latitude: 52, longitude: 21, city: "Berlin", address: "Changed address" } } satisfies SubmissionUpdate;
    scriptDraftUpdate(draftFixture([draftRadios[0]]), body, {
      old: previous,
      lookupRetainedOwner: true,
      retainedOwnerRegions: [{ id: 1, countryCode: "PL" }, { id: 2, countryCode: "DE" }],
    });
    const response = await injectMutation(route, { ...request, payload: body }, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(response.json().errors[0].details).toEqual([{ field: "location/structure/ownerName" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => call.operation === "select")).toBe(true);
  });

  it("preserves an omitted pending owner proposal when moving between regions of the same country", async () => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const previous = draftFixture([draftRadios[0]]);
    previous.snapshot.proposedLocation = { ...draftLocation, structure_owner_name: "Original Owner" };
    const fixture = draftFixture([draftRadios[0]]);
    fixture.snapshot.proposedLocation = { ...draftLocation, region_id: 2, structure_owner_name: "Original Owner" };
    const body = { location: { regionId: 2, latitude: 52, longitude: 21, city: "Warsaw", address: "Example 1" } } satisfies SubmissionUpdate;
    scriptDraftUpdate(fixture, body, {
      old: previous,
      lookupRetainedOwner: true,
      retainedOwnerRegions: [{ id: 1, countryCode: "PL" }, { id: 2, countryCode: "PL" }],
    });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values).toMatchObject({
      region_id: 2,
      structure_owner_name: "Original Owner",
    });
  });

  it("retains an omitted name across countries when the destination already has that owner", async () => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const previous = draftFixture([draftRadios[0]]);
    previous.snapshot.proposedLocation = { ...draftLocation, structure_owner_name: "Original Owner" };
    const fixture = draftFixture([draftRadios[0]]);
    fixture.snapshot.proposedLocation = { ...draftLocation, region_id: 2, structure_owner_name: "Original Owner" };
    const body = { location: { regionId: 2, latitude: 52, longitude: 21, city: "Berlin", address: "Example 1" } } satisfies SubmissionUpdate;
    dbMock.enqueueFor("select", "structure_owners", [{ id: 99, name: "Original Owner", countryCode: "DE", brandId: null, operatorId: null }]);
    scriptDraftUpdate(fixture, body, { old: previous, countryCode: "DE", lookupRetainedOwner: true });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values).toMatchObject({
      region_id: 2,
      structure_owner_name: "Original Owner",
    });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
  });

  it.each([
    { description: "a different unknown name", ownerName: "Replacement Owner", regionId: 1 },
    { description: "the same name in a different country", ownerName: "Original Owner", regionId: 2 },
  ])("rejects $description while proposals are disabled", async ({ ownerName, regionId }) => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const previous = draftFixture([draftRadios[0]]);
    previous.snapshot.proposedLocation = { ...draftLocation, structure_owner_name: "Original Owner" };
    const body = {
      location: { regionId, latitude: 52, longitude: 21, city: "Warsaw", address: "Example 1", structure: { ownerName } },
    } satisfies SubmissionUpdate;
    scriptDraftUpdate(draftFixture([draftRadios[0]]), body, {
      old: previous,
      retainedOwnerRegions: [{ id: 1, countryCode: "PL" }, { id: 2, countryCode: "DE" }],
    });
    const response = await injectMutation(route, { ...request, payload: body }, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(response.json().errors[0].details).toEqual([{ field: "location/structure/ownerName" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => call.operation === "select")).toBe(true);
  });

  it("rejects a new owner name from a moderator while proposals are disabled", async () => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const body = {
      location: { regionId: 1, latitude: 52, longitude: 21, structure: { ownerName: "Moderator Proposal" } },
    } satisfies SubmissionUpdate;
    scriptDraftUpdate(draftFixture([draftRadios[0]]), body, { role: "admin" });
    const response = await injectMutation(route, { ...request, payload: body }, { session: userSession(submitterId, "admin") });
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects clearing a sector still used by an omitted cell proposal", async () => {
    const fixture = draftFixture([draftRadios[0]]);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(fixture.row);
    dbMock.query.proposedSectors.findFirst.mockResolvedValue(fixture.sectors[0]);
    dbMock.query.proposedCells.findMany.mockResolvedValue(fixture.cells.map(({ cell }) => cell));
    const response = await injectMutation(route, { ...request, payload: { sectors: [] } }, options);
    expectError(response, 400, "BAD_REQUEST");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: "omitted structure",
      structure: undefined,
      ownerId: null,
      ownerName: "Original Owner",
      structureType: "mast",
      structureNote: "Original structure note",
    },
    {
      description: "explicitly cleared owner",
      structure: { ownerId: null },
      ownerId: null,
      ownerName: null,
      structureType: "mast",
      structureNote: "Original structure note",
    },
    {
      description: "replacement owner name",
      structure: { ownerName: "Corrected Owner" },
      ownerId: null,
      ownerName: "Corrected Owner",
      structureType: "mast",
      structureNote: "Original structure note",
    },
    {
      description: "replacement owner id",
      structure: { ownerId: 99 },
      ownerId: 99,
      ownerName: null,
      structureType: "mast",
      structureNote: "Original structure note",
    },
    {
      description: "explicitly cleared type and note",
      structure: { type: null, note: null },
      ownerId: null,
      ownerName: "Original Owner",
      structureType: null,
      structureNote: null,
    },
  ] as const)(
    "preserves a stored location move and handles $description",
    async ({ structure, ownerId, ownerName, structureType, structureNote }) => {
      const previous = draftFixture([draftRadios[0]]);
      previous.snapshot.proposedLocation = {
        ...previous.snapshot.proposedLocation!,
        move: "location",
        structure_type: "mast",
        structure_owner_name: "Original Owner",
        structure_note: "Original structure note",
      };
      const fixture = draftFixture([draftRadios[0]]);
      fixture.snapshot.proposedLocation = {
        ...fixture.snapshot.proposedLocation!,
        move: "location",
        structure_type: structureType,
        structure_owner_id: ownerId,
        structure_owner_name: ownerName,
        structure_note: structureNote,
      };
      const body = {
        location: {
          regionId: 1,
          latitude: 52,
          longitude: 21,
          city: "Warsaw",
          address: "Example 1",
          ...(structure === undefined ? {} : { structure }),
        },
      };
      scriptDraftUpdate(fixture, body, { old: previous });
      const { app, errors } = await createRouteHarnessWithErrors(route, options);
      const response = await app.inject({ ...request, payload: body });
      expect(errors).toEqual([]);
      expect(response.statusCode).toBe(200);
      const values = dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values;
      expect(values).toMatchObject({ move: "location", structure_owner_id: ownerId, structure_type: structureType, structure_note: structureNote });
      if (ownerName !== null) expect(values).toMatchObject({ structure_owner_name: ownerName });
      else expect(values).not.toMatchObject({ structure_owner_name: "Original Owner" });
      expect(response.json().data.changes.location.move).toBe("location");
      expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["proposed_locations"]);
      expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
    },
  );

  it("stamps the country again when an edit moves the proposed location to another region", async () => {
    const previous = draftFixture([draftRadios[0]]);
    const fixture = draftFixture([draftRadios[0]]);
    fixture.row.country_code = "DE";
    fixture.snapshot.country_code = "DE";
    fixture.snapshot.proposedLocation = { ...fixture.snapshot.proposedLocation!, region_id: 2, latitude: 50, longitude: 14 };
    const body = { location: { regionId: 2, latitude: 50, longitude: 14 } };
    scriptDraftUpdate(fixture, body, { old: previous, countryCode: "DE" });
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: body });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ countryCode: "DE", changes: { location: { regionId: 2 } } });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "submissions").map((call) => call.values)).toEqual([
      { updatedAt: expect.any(Date) },
      { country_code: "DE" },
    ]);
    const order = dbMock.calls.map((call) => `${call.operation} ${call.table}`);
    expect(order.lastIndexOf("update submissions")).toBeGreaterThan(order.indexOf("insert proposed_locations"));
    expect(order.lastIndexOf("update submissions")).toBeLessThan(order.indexOf("insert audit_logs"));
  });

  it("allows an administrator to correct only the review note after rejection", async () => {
    const initial = { ...submissionRow, status: "rejected" };
    const updated = { ...initial, review_notes: "Corrected review" };
    const snapshot = { ...initial, proposedStation: null, proposedLocation: null, proposedSectors: [], proposedCells: [] };
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.query.submissions.findFirst
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, ...updated });
    dbMock.query.proposedSectors.findMany.mockResolvedValue([]);
    dbMock.query.proposedCells.findMany.mockResolvedValue([]);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ status: "rejected", updatedAt: initial.updatedAt }], [updated]);
    dbMock.enqueueFor("update", "submissions", []);
    scriptSubmissionSerialization("admin");
    const { app, errors } = await createRouteHarnessWithErrors(route, { session: userSession(submitterId, "admin") });
    const response = await app.inject({ ...request, payload: { reviewNote: "Corrected review" } });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { status: "rejected", reviewNote: "Corrected review" } });
    const changes = dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values;
    expect(changes).toMatchObject({ review_notes: "Corrected review" });
    expect(changes).not.toHaveProperty("status");
    expect(changes).not.toHaveProperty("submitter_note");
  });

  it("rejects an administrator's other edits after review", async () => {
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status: "approved" });
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    expectError(
      await injectMutation(
        route,
        { ...request, payload: { reviewNote: "Corrected review", note: "Changed evidence" } },
        { session: userSession(submitterId, "admin") },
      ),
      400,
      "BAD_REQUEST",
      "Only the review note of a reviewed submission can be changed",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([{ siteId: "NEW" }, { operatorId: 7 }])("requires both station identifiers when replacing a new station proposal: %j", async (station) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    expectError(
      await injectMutation(route, { ...request, payload: { station } }, options),
      400,
      "BAD_REQUEST",
      "siteId and operatorId are required for a new station",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("requires a backhaul medium when replacing a new station's backhaul", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    expectError(
      await injectMutation(route, { ...request, payload: { station: { siteId: "NEW", operatorId: 7, backhaul: { speedMbps: 100 } } } }, options),
      400,
      "BAD_REQUEST",
      "medium is required for a new station's backhaul",
    );
  });

  it("rejects removing live photos from a new station proposal", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    expectError(
      await injectMutation(route, { ...request, payload: { photos: { removeIds: ["22222222-2222-4222-8222-222222222222"] } } }, options),
      400,
      "BAD_REQUEST",
      "Photos can only be removed when updating a station",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("updates only the owner's note and leaves omitted proposal sections untouched", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const updated = { ...submissionRow, submitter_note: "Updated note" };
    const snapshot = { ...submissionRow, proposedStation: null, proposedLocation: null, proposedSectors: [], proposedCells: [] };
    dbMock.query.submissions.findFirst
      .mockResolvedValueOnce(submissionRow)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({ ...snapshot, ...updated });
    dbMock.query.proposedSectors.findMany.mockResolvedValue([]);
    dbMock.query.proposedCells.findMany.mockResolvedValue([]);
    scriptAudit();
    dbMock.enqueueFor("select", "submissions", [{ status: "pending", updatedAt: submissionRow.updatedAt }], [updated]);
    dbMock.enqueueFor("update", "submissions", []);
    scriptSubmissionSerialization();
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { note: "Updated note", reviewNote: "Earlier note", status: "pending" } });
    const changes = dbMock.calls.find((call) => call.operation === "update" && call.table === "submissions")?.values;
    expect(changes).toMatchObject({ submitter_note: "Updated note" });
    expect(changes).not.toHaveProperty("review_notes");
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "submissions")).toHaveLength(1);
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table?.startsWith("proposed_"))).toBe(false);
  });

  it("rejects a note update that changes nothing", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, submitter_note: "Updated note" });
    const response = await injectMutation(route, request, options);
    expectError(response, 400, "BAD_REQUEST", "No changes detected. Please modify the data before updating.");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("rejects a replacement cell update that names no field before reading the submission", async () => {
    const cells = [
      { action: "delete", id: 102 },
      { action: "update", id: 101 },
    ];
    const response = await injectMutation(route, { ...request, payload: { cells } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "cells/1", validationMessage: "A cell update needs at least one field to change" }]);
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
    expect(dbMock.calls).toEqual([]);
  });

  it("reports only the unknown key of a replacement cell update that names no other field", async () => {
    const cells = [{ action: "update", id: 101, stationId: 4 }];
    const response = await injectMutation(route, { ...request, payload: { cells } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "cells/0", validationMessage: 'Unrecognized key: "stationId"' }]);
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
    expect(dbMock.calls).toEqual([]);
  });

  it("points at the invalid field of a replacement cell update with a value of the wrong type", async () => {
    const cells = [{ action: "update", id: 101, pci: "x" }];
    const response = await injectMutation(route, { ...request, payload: { cells } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([
      { field: "cells/0/pci", validationMessage: "Invalid input: expected number, received string" },
    ]);
    expect(dbMock.query.submissions.findFirst).not.toHaveBeenCalled();
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
    dbMock.query.submissions.findFirst.mockResolvedValue(undefined);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it.each(["approved", "rejected"])("rejects modifying the owner's reviewed %s submission", async (status) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, status });
    const response = await injectMutation(route, request, options);
    expectError(response, 400, "BAD_REQUEST", "Only pending submissions can be modified");
  });

  it("rejects editing another submitter's pending submission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, submitter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FORBIDDEN");
  });

  it("rejects an owner's attempt to change the review note", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue(submissionRow);
    const response = await injectMutation(route, { ...request, payload: { reviewNote: "Changed review" } }, options);
    expectError(response, 403, "FORBIDDEN", "Cannot modify review notes");
  });

  it("rejects content changes in a station deletion submission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.query.submissions.findFirst.mockResolvedValue({ ...submissionRow, type: "delete" });
    const response = await injectMutation(route, { ...request, payload: { station: { notes: "New data" } } }, options);
    expectError(response, 400, "BAD_REQUEST", "A delete carries no changes, only a note");
  });
});

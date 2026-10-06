import { describe, expect, it } from "vitest";

import { createSession } from "../../../../../../client/src/features/station-editing/model/draftReducer";
import { toEditErrors } from "../../../../../../client/src/features/station-editing/model/serverRefusals";
import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(post)/submissions/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
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
  liveDraftLocation,
  liveDraftStation,
  scriptContentDraftCreate,
  scriptDraftBatchCreate,
  scriptDraftCreate,
  scriptDraftGeography,
  scriptDraftTranslation,
  scriptExistingDraftCreate,
} from "../../../../helpers/submissionDraftFixtures.js";
import {
  scriptCountryStamp,
  scriptSubmissionSerialization,
  submissionId,
  submissionRow,
  submitterId,
} from "../../../../helpers/submissionFixtures.js";
import { submissionPhotoId } from "../../../../helpers/submissionPhotoFixtures.js";

const change = { action: "create", station: { siteId: "SITE-7", operatorId: 7 }, photos: { uploadCount: 1 } };
const request = { method: "POST" as const, url: "/submissions", payload: [change] };
const options = { session: userSession(submitterId) };

function scriptPreflight(submitter: { name: string; username: string | null } = { name: "Contributor", username: "contributor" }): void {
  dbMock.enqueueFor("select", "users", [submitter]);
  dbMock.enqueueFor("select", "operators", [{ id: 7 }], [{ id: 7, countryCode: "PL" }]);
  dbMock.enqueueFor("select", "countries", []);
  dbMock.query.stations.findFirst.mockResolvedValue(undefined);
}

describe("POST /submissions", () => {
  it.each(["location/structure/ownerName", "0/location/structure/ownerName", "1/location/structure/ownerName"])(
    "localizes the disabled proposal field %s independently of server message text",
    (field) => {
      const session = createSession({ kind: "form", action: "create", countryCode: "PL", live: null, proposed: null });
      const errors = toEditErrors(
        { errors: [{ code: "FEATURE_DISABLED", message: "Arbitrary server wording", details: [{ field }] }] },
        null,
        session,
      );
      expect(errors).toEqual([{ target: { scope: "place", field: "structureOwner" }, messageKey: "stations:edit.refusals.featureDisabled" }]);
    },
  );

  it("keeps a general disabled feature error away from the structure owner field", () => {
    const session = createSession({ kind: "form", action: "create", countryCode: "PL", live: null, proposed: null });
    const errors = toEditErrors({ errors: [{ code: "FEATURE_DISABLED", message: "This feature is disabled", details: [] }] }, null, session);
    expect(errors).toEqual([{ target: { scope: "general" }, messageKey: "stations:edit.refusals.featureDisabled" }]);
  });

  it("does not use an unrelated machine path to identify the disabled owner proposal field", () => {
    const session = createSession({ kind: "form", action: "create", countryCode: "PL", live: null, proposed: null });
    const errors = toEditErrors(
      { errors: [{ code: "FEATURE_DISABLED", message: "This feature is disabled", details: [{ field: "location/structure/note" }] }] },
      null,
      session,
    );
    expect(errors).toEqual([{ target: { scope: "general" }, messageKey: "stations:edit.refusals.featureDisabled" }]);
  });

  it.each([
    { description: "medium only", backhaul: { medium: "fiber" }, fields: ["uplink_type"], stored: { uplink_type: "fiber" } },
    { description: "speed only", backhaul: { speedMbps: 2000 }, fields: ["uplink_speed"], stored: { uplink_speed: 2000 } },
    { description: "cleared speed", backhaul: { speedMbps: null }, fields: ["uplink_speed"], stored: { uplink_speed: null } },
    { description: "cleared model", backhaul: { model: null }, fields: ["uplink_model"], stored: { uplink_model: null } },
    {
      description: "removed backhaul",
      backhaul: null,
      fields: ["uplink_type", "uplink_speed", "uplink_model"],
      stored: { uplink_type: null, uplink_speed: null, uplink_model: null },
    },
  ] as const)("stores only the changed fields of an existing station's $description", async ({ backhaul, fields, stored }) => {
    const fixture = existingContentDraft();
    fixture.input.station = { backhaul };
    fixture.snapshot.proposedStation = {
      ...draftStation,
      station_id: null,
      operator_id: null,
      notes: null,
      networks_id: null,
      networks_name: null,
      mno_name: null,
      uplink_type: null,
      uplink_speed: null,
      uplink_model: null,
      ...stored,
      changed_fields: [...fields],
    };
    scriptContentDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes).toMatchObject({ station: { backhaul }, location: null, cells: [], sectors: [] });
    const inserted = dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_stations")?.values;
    expect(inserted).toMatchObject({ ...stored, changed_fields: fields, submission_id: submissionId });
    expect(inserted).not.toHaveProperty("station_id");
    expect(dbMock.calls.some((call) => call.operation !== "select" && call.table === "station_uplinks")).toBe(false);
  });

  it("stores changed station identity and cleared identifiers without copying unchanged live fields", async () => {
    const fixture = existingContentDraft();
    fixture.input.station = {
      siteId: "SITE-CHANGED",
      operatorId: 8,
      notes: null,
      identifiers: [
        { kind: "networksId", value: null },
        { kind: "networksName", value: "Changed Network" },
        { kind: "operatorName", value: null },
      ],
    };
    fixture.snapshot.proposedStation = {
      ...draftStation,
      station_id: "SITE-CHANGED",
      operator_id: 8,
      notes: null,
      networks_id: null,
      networks_name: "Changed Network",
      mno_name: null,
      changed_fields: ["station_id", "operator_id", "notes", "networks_id", "networks_name", "mno_name"],
    };
    scriptContentDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.station).toEqual(fixture.input.station);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_stations")?.values).toMatchObject({
      station_id: "SITE-CHANGED",
      operator_id: 8,
      notes: null,
      networks_id: null,
      networks_name: "Changed Network",
      mno_name: null,
      changed_fields: ["station_id", "operator_id", "notes", "networks_id", "networks_name", "mno_name"],
    });
  });

  it.each([
    {
      description: "identical live station fields",
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
    },
    { description: "empty backhaul", station: { backhaul: {} } },
  ] as const)("rejects an update containing $description and no actual change", async ({ station }) => {
    const fixture = existingContentDraft();
    const { identifiers, ...fields } = station;
    fixture.input.station = { ...fields, identifiers: identifiers === undefined ? undefined : [...identifiers] };
    scriptContentDraftCreate(fixture);
    expectError(
      await injectMutation(route, { ...request, payload: [fixture.input] }, options),
      400,
      "BAD_REQUEST",
      "No changes detected. Please modify the data before submitting.",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: "metadata without moving",
      location: {
        city: null,
        address: "Changed address",
        structure: { type: "rooftopMast", ownerName: "Proposed Owner", note: "Changed structure" },
      },
      fields: ["city", "address", "structure_type", "structure_owner_id", "structure_note"],
      stored: {
        city: null,
        address: "Changed address",
        structure_type: "rooftop_mast",
        structure_owner_id: null,
        structure_owner_name: "Proposed Owner",
        structure_note: "Changed structure",
        latitude: null,
        longitude: null,
      },
    },
    {
      description: "move with retained structure",
      location: { latitude: 53, longitude: 22, regionId: 1, structure: { type: "mast", ownerId: 9, note: "Live structure" }, move: "location" },
      fields: ["structure_type", "structure_owner_id", "structure_note", "latitude", "longitude"],
      stored: {
        structure_type: "mast",
        structure_owner_id: 9,
        structure_owner_name: null,
        structure_note: "Live structure",
        latitude: 53,
        longitude: 22,
      },
    },
    {
      description: "cleared structure",
      location: { structure: { type: null, ownerId: null, note: null } },
      fields: ["structure_type", "structure_owner_id", "structure_note"],
      stored: { structure_type: null, structure_owner_id: null, structure_owner_name: null, structure_note: null, latitude: null, longitude: null },
    },
  ] as const)("records only location changes for $description", async ({ location, fields, stored }) => {
    const fixture = existingContentDraft();
    fixture.input.location = location;
    fixture.snapshot.proposedLocation = {
      ...draftLocation,
      region_id: null,
      city: null,
      address: null,
      ...stored,
      move: location.move ?? "station",
      changed_fields: [...fields],
    };
    scriptContentDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    const { regionId: _regionId, ...expectedLocation } = location;
    expect(response.json().data[0].changes).toMatchObject({
      station: null,
      location: { ...expectedLocation, ...("ownerName" in location.structure ? { structure: { ...location.structure, ownerId: null } } : {}) },
    });
    const locationInsert = dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values;
    expect(locationInsert).toMatchObject({ changed_fields: expect.arrayContaining([...fields]), submission_id: submissionId });
    const changedFields =
      typeof locationInsert === "object" && locationInsert !== null && "changed_fields" in locationInsert ? locationInsert.changed_fields : undefined;
    expect(changedFields).toHaveLength(fields.length);
    expect(dbMock.calls.some((call) => call.operation !== "select" && call.table === "locations")).toBe(false);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
  });

  it.each([true, false])("binds an existing named owner while proposals are enabled=%s", async (enabled) => {
    getRuntimeSettings().structureOwnerProposalsEnabled = enabled;
    const fixture = existingContentDraft();
    fixture.input.location = { address: "Changed address", structure: { ownerName: "Existing Owner" } };
    fixture.snapshot.proposedLocation = {
      ...draftLocation,
      region_id: null,
      latitude: null,
      longitude: null,
      city: null,
      address: "Changed address",
      structure_owner_id: 99,
      changed_fields: ["address", "structure_owner_id"],
    };
    dbMock.enqueueFor("select", "structure_owners", [{ id: 99, name: "Existing Owner", countryCode: "PL", brandId: null, operatorId: null }]);
    scriptContentDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.location.structure).toEqual({ ownerId: 99, ownerName: null });
    const values = dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values;
    expect(values).toMatchObject({ structure_owner_id: 99, changed_fields: ["address", "structure_owner_id"] });
    expect(values).not.toHaveProperty("structure_owner_name");
  });

  it("rejects a location replacement that exactly matches the current location", async () => {
    const fixture = existingContentDraft();
    fixture.input.location = {
      regionId: 1,
      latitude: 52,
      longitude: 21,
      city: "Warsaw",
      address: "Example 1",
      structure: { type: "mast", ownerId: 9, note: "Live structure" },
    };
    scriptContentDraftCreate(fixture);
    expectError(
      await injectMutation(route, { ...request, payload: [fixture.input] }, options),
      400,
      "BAD_REQUEST",
      "No changes detected. Please modify the data before submitting.",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([{ failure: [] }, { failure: new Error("Radio storage failed") }])(
    "aborts draft creation when a proposed-cell insert fails: %j",
    async ({ failure }) => {
      const fixture = draftFixture([draftRadios[0]]);
      dbMock.enqueueFor("insert", "proposed_cells", failure);
      scriptDraftCreate(fixture);
      expectError(await injectMutation(route, { ...request, payload: [fixture.input] }, options), 500, "FAILED_TO_CREATE");
      expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "proposed_gsm_cells")).toBe(false);
      expect(dbMock.calls.some((call) => call.operation === "insert" && ["audit_logs", "notifications"].includes(call.table ?? ""))).toBe(false);
    },
  );

  it.each(["inactive", undefined])("rejects a station that is unavailable after the initial visibility check: %s", async (status) => {
    const fixture = existingContentDraft();
    fixture.input = { action: "delete", stationId: 1, note: "Removed station" };
    scriptContentDraftCreate(fixture);
    dbMock.query.stations.findFirst.mockResolvedValue(status === undefined ? undefined : stationRow({ status }));
    expectError(await injectMutation(route, { ...request, payload: [fixture.input] }, options), 404, "NOT_FOUND", "Station not found");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a target cell moved to another station after the input was translated", async () => {
    const { fixture, targets } = existingDraftFixture([draftRadios[0]]);
    scriptExistingDraftCreate(fixture, targets);
    dbMock.query.cells.findMany.mockResolvedValue([{ ...targets[0]!.cell, station_id: 2 }]);
    expectError(
      await injectMutation(route, { ...request, payload: [fixture.input] }, options),
      404,
      "NOT_FOUND",
      "Cell 100 does not exist on this station",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
  it("creates a batch in request order with distinct proposal ownership in one audited operation", async () => {
    const first = draftFixture([draftRadios[0]]);
    const second = draftFixture([draftRadios[3]], "22222222-2222-4222-8222-222222222222", 100);
    second.input.station = { ...second.input.station!, siteId: "SITE-8" };
    second.snapshot.proposedStation = { ...second.snapshot.proposedStation!, station_id: "SITE-8" };
    scriptDraftBatchCreate([first, second]);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [first.input, second.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject([
      { id: first.row.id, changes: { station: { siteId: "SITE-7" }, cells: [{ rat: "gsm" }] } },
      { id: second.row.id, changes: { station: { siteId: "SITE-8" }, cells: [{ rat: "nr" }] } },
    ]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_operations")).toHaveLength(1);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "proposed_cells").map((call) => call.values)).toMatchObject([
      { submission_id: first.row.id, rat: "GSM" },
      { submission_id: second.row.id, rat: "NR" },
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      { record_id: first.row.id, new_values: { cells: [{ rat: "GSM" }] } },
      { record_id: second.row.id, new_values: { cells: [{ rat: "NR" }] } },
    ]);
  });

  it("stamps a new submission's country from the rows it stored, before the audit entry is written", async () => {
    const fixture = draftFixture([draftRadios[0]]);
    scriptDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].countryCode).toBe("PL");
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "submissions")?.values).not.toHaveProperty("country_code");
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "submissions").map((call) => call.values)).toEqual([
      { country_code: "PL" },
    ]);
    const placement = dbMock.calls.find((call) => call.operation === "select" && call.table === "submissions");
    expect(Object.keys(placement?.selection ?? {})).toEqual(["stationId", "regionId", "operatorId"]);
    const order = dbMock.calls.map((call) => `${call.operation} ${call.table}`);
    expect(order.indexOf("update submissions")).toBeGreaterThan(order.indexOf("insert proposed_locations"));
    expect(order.indexOf("update submissions")).toBeLessThan(order.indexOf("insert audit_logs"));
  });

  it("stamps an update that proposes no other place with the country of its station", async () => {
    const { fixture, targets } = existingDraftFixture([draftRadios[0]]);
    scriptExistingDraftCreate(fixture, targets);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0]).toMatchObject({ stationId: 1, countryCode: "PL" });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "submissions").map((call) => call.values)).toEqual([
      { country_code: "PL" },
    ]);
    expect(dbMock.calls.some((call) => call.operation === "select" && call.table === "regions")).toBe(false);
  });

  it.each([
    {
      description: "unknown UMTS identity",
      index: 1,
      input: { action: "create", rat: "umts", bandId: 2, rnc: null, cid: null },
      details: { rnc: 0, cid: 0, lac: null, psc: null, arfcn: null },
      expected: { rnc: null, cid: null },
    },
    {
      description: "unknown LTE identity",
      index: 2,
      input: { action: "create", rat: "lte", bandId: 3, enbid: null, clid: null },
      details: { enbid: 0, clid: 0, tac: null, pci: null, earfcn: null, supports_iot: false },
      expected: { enbid: null, clid: null },
    },
    {
      description: "zero LTE unknown sentinel",
      index: 2,
      input: { action: "create", rat: "lte", bandId: 3, enbid: 0, clid: 0 },
      details: { enbid: 0, clid: 0, tac: null, pci: null, earfcn: null, supports_iot: false },
      expected: { enbid: null, clid: null },
    },
    {
      description: "NR NSA with absent standalone identifiers",
      index: 3,
      input: {
        action: "create",
        rat: "nr",
        bandId: 4,
        mode: "nsa",
        tac: null,
        gnbid: null,
        clid: null,
        pci: 0,
        arfcn: 630000,
        supportsRedCap: false,
      },
      details: { type: "nsa", nrtac: null, gnbid: null, gnbid_length: null, clid: null, pci: 0, arfcn: 630000, supports_nr_redcap: false },
      expected: { mode: "nsa", tac: null, gnbid: null, clid: null, supportsRedCap: false },
    },
    {
      description: "NR SA with zero identifiers",
      index: 3,
      input: { action: "create", rat: "nr", bandId: 4, mode: "sa", tac: 0, gnbid: 0, clid: 0 },
      details: { type: "sa", nrtac: 0, gnbid: 0, gnbid_length: null, clid: 0, pci: null, arfcn: null, supports_nr_redcap: false },
      expected: { mode: "sa", tac: 0, gnbid: null, clid: 0 },
    },
  ] as const)("preserves $description in the draft and public representation", async ({ index, input, details, expected }) => {
    const radio = draftRadios[index]!;
    const fixture = draftFixture([radio]);
    fixture.input.cells = [input];
    fixture.cells[0] = {
      ...fixture.cells[0]!,
      cell: { ...fixture.cells[0]!.cell, sector_local_id: null, type: null, notes: null },
      [radio.rat]: { ...details, proposed_cell_id: 40 },
    };
    fixture.snapshot.proposedCells = fixture.cells.map(({ cell, ...rows }) => ({ ...cell, ...rows }));
    scriptDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.cells).toMatchObject([{ rat: radio.rat, ...expected }]);
    const values = dbMock.calls.find((call) => call.operation === "insert" && call.table === radio.table)?.values;
    expect(values).toMatchObject({
      proposed_cell_id: 40,
      ...Object.fromEntries(Object.entries(details).filter(([, value]) => value !== null && value !== false)),
    });
    if ("supportsRedCap" in input) expect(values).toMatchObject({ supports_nr_redcap: input.supportsRedCap });
    if (radio.rat === "umts") expect(values).toMatchObject({ rnc: 0, cid: 0 });
    if (radio.rat === "lte") expect(values).toMatchObject({ enbid: 0, clid: 0 });
  });

  it.each([
    {
      input: { action: "create", rat: "umts", bandId: 2, rnc: 1, cid: null },
      message: "RNC and CID are unknown together: a cell with a known RNC needs a CID",
    },
    {
      input: { action: "create", rat: "lte", bandId: 3, enbid: 1, clid: null },
      message: "eNB ID and CLID are unknown together: a cell with a known eNB ID needs a CLID",
    },
  ])("rejects a known radio node with an unknown cell identity: $input.rat", async ({ input, message }) => {
    const fixture = draftFixture([draftRadios[0]]);
    dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
    dbMock.enqueueFor("select", "regions", [{ id: 1 }]);
    dbMock.enqueueFor("select", "bands", [{ id: input.bandId }]);
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
    const response = await injectMutation(route, { ...request, payload: [{ ...fixture.input, cells: [input] }] }, options);
    expectError(response, 400, "BAD_REQUEST", message);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(["tac", "gnbid", "clid", "supportsRedCap"])("rejects standalone field %s on an NR NSA draft with its exact batch field", async (field) => {
    const fixture = draftFixture([draftRadios[3]]);
    const cell = { action: "create", rat: "nr", bandId: 4, mode: "nsa", [field]: field === "supportsRedCap" ? true : 1 };
    scriptDraftTranslation(fixture);
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
    const response = await injectMutation(route, { ...request, payload: [{ ...fixture.input, cells: [cell] }] }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toContainEqual(expect.objectContaining({ field: `0/cells/0/${field}` }));
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("creates a station deletion draft and leaves the published station active until review", async () => {
    const station = stationRow({ operator_id: 7 });
    const created = { ...submissionRow, station_id: 1, type: "delete", submitter_note: "Station dismantled" };
    dbMock.enqueueFor("select", "stations", [{ station, countryCode: null }], [{ countryCode: "PL", regionId: 1 }]);
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.query.stations.findFirst.mockResolvedValue(station);
    scriptAudit();
    dbMock.enqueueFor("insert", "submissions", [created]);
    scriptCountryStamp({ stationId: 1 });
    dbMock.query.submissions.findFirst.mockResolvedValue({
      ...created,
      proposedStation: null,
      proposedLocation: null,
      proposedSectors: [],
      proposedCells: [],
    });
    dbMock.enqueueFor("select", "proposed_stations", [], [], []);
    dbMock.enqueueFor(
      "select",
      "stations",
      [{ id: 1, stationId: "A1", operatorName: "Operator", operatorMnc: 7 }],
      [{ countryCode: "PL", regionId: 1 }],
    );
    dbMock.enqueueFor("select", "submissions", [{ stationId: 1 }]);
    for (const table of ["proposed_locations", "proposed_sectors", "proposed_cells", "submission_location_photo_selections"])
      dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("select", "users", []);
    scriptSubmissionSerialization();
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [{ action: "delete", stationId: 1, note: "Station dismantled" }] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0]).toMatchObject({
      action: "delete",
      stationId: 1,
      note: "Station dismantled",
      status: "pending",
      changes: { station: null, location: null, sectors: [], cells: [] },
    });
    expect(dbMock.calls.filter((call) => call.operation === "insert").map((call) => call.table)).toEqual([
      "audit_operations",
      "submissions",
      "audit_logs",
    ]);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "stations")).toBe(false);
  });

  it.each(draftRadios)("hydrates an existing $rat cell's radio details when creating a sparse update proposal", async (radio) => {
    const { fixture, targets } = existingDraftFixture([radio]);
    scriptExistingDraftCreate(fixture, targets);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0]).toMatchObject({
      action: "update",
      stationId: 1,
      changes: { station: null, location: null, sectors: [], cells: [{ action: "update", id: 100, rat: radio.rat, notes: null }] },
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === radio.table)?.values).toMatchObject({
      ...Object.fromEntries(Object.entries(radio.details).filter(([, value]) => value !== null)),
      proposed_cell_id: 40,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_cells")?.values).toMatchObject({
      operation: "update",
      target_cell_id: 100,
      notes: "",
    });
    expect(dbMock.calls.some((call) => call.operation !== "select" && call.table === "cells")).toBe(false);
  });

  it("records removal proposals for all radio types without writing new radio detail rows", async () => {
    const { fixture, targets } = existingDraftFixture(draftRadios, "delete");
    scriptExistingDraftCreate(fixture, targets);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.cells).toMatchObject(
      draftRadios.map((radio, index) => ({ action: "delete", id: 100 + index, rat: radio.rat })),
    );
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "proposed_cells")).toHaveLength(4);
    expect(dbMock.calls.some((call) => call.operation === "insert" && draftRadios.some((radio) => radio.table === call.table))).toBe(false);
    expect(
      dbMock.calls.some(
        (call) => call.operation === "delete" && ["cells", "gsm_cells", "umts_cells", "lte_cells", "nr_cells"].includes(call.table ?? ""),
      ),
    ).toBe(false);
  });

  it("clears explicit nullable LTE fields while preserving omitted identifiers and live notes in an update draft", async () => {
    const { fixture, targets } = existingDraftFixture([draftRadios[2]]);
    fixture.input.cells = [{ action: "update", id: 100, tac: null, pci: null, earfcn: null, supportsIot: false }];
    fixture.cells[0] = {
      ...fixture.cells[0]!,
      cell: { ...fixture.cells[0]!.cell, notes: null },
      lte: { ...draftRadios[2].details, proposed_cell_id: 40, tac: null, pci: null, earfcn: null, supports_iot: false },
    };
    fixture.snapshot.proposedCells = fixture.cells.map(({ cell, ...radio }) => ({ ...cell, ...radio }));
    scriptExistingDraftCreate(fixture, targets);
    dbMock.enqueueFor("select", "cells", [{ id: 100, notes: "Stored evidence" }]);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.cells).toMatchObject([
      { action: "update", id: 100, enbid: 1048575, clid: 255, notes: "Stored evidence", tac: null, pci: null, earfcn: null, supportsIot: false },
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_lte_cells")?.values).toMatchObject({
      enbid: 1048575,
      clid: 255,
      tac: null,
      pci: null,
      earfcn: null,
      supports_iot: false,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_cells")?.values).toMatchObject({ notes: null });
  });

  it("allows an NR SA cell to propose NSA only when its standalone fields are explicitly cleared", async () => {
    const { fixture, targets } = existingDraftFixture([draftRadios[3]]);
    fixture.input.cells = [{ action: "update", id: 100, mode: "nsa", tac: null, gnbid: null, clid: null, supportsRedCap: false, notes: null }];
    fixture.cells[0] = {
      ...fixture.cells[0]!,
      nr: { ...draftRadios[3].details, proposed_cell_id: 40, type: "nsa", nrtac: null, gnbid: null, clid: null, supports_nr_redcap: false },
    };
    fixture.snapshot.proposedCells = fixture.cells.map(({ cell, ...radio }) => ({ ...cell, ...radio }));
    scriptExistingDraftCreate(fixture, targets);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.cells).toMatchObject([{ mode: "nsa", tac: null, gnbid: null, clid: null, supportsRedCap: false }]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_nr_cells")?.values).toMatchObject({
      type: "nsa",
      nrtac: null,
      gnbid: null,
      clid: null,
      supports_nr_redcap: false,
    });
  });

  it("rejects switching an NR SA draft to NSA when omitted standalone fields would be retained", async () => {
    const { fixture, targets } = existingDraftFixture([draftRadios[3]]);
    dbMock.enqueueFor("select", "stations", [{ station: stationRow(), countryCode: null }]);
    dbMock.enqueueFor("select", "cells", targets);
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
    const response = await injectMutation(
      route,
      { ...request, payload: [{ ...fixture.input, cells: [{ action: "update", id: 100, mode: "nsa" }] }] },
      options,
    );
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "0/cells/0/tac" }),
        expect.objectContaining({ field: "0/cells/0/gnbid" }),
        expect.objectContaining({ field: "0/cells/0/clid" }),
        expect.objectContaining({ field: "0/cells/0/supportsRedCap" }),
      ]),
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(draftRadios)("creates a $rat draft with location, sectors, and radio details without announcing photos", async (radio) => {
    const fixture = draftFixture([radio]);
    scriptDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0]).toMatchObject({
      status: "pending",
      action: "create",
      changes: {
        station: fixture.input.station,
        location: { ...fixture.input.location, move: "station" },
        sectors: [
          { key: "north", azimuth: 0 },
          { key: "south", azimuth: 180 },
        ],
        cells: [{ ...radio.input, sectorKey: "north", cellType: "macro", notes: "Radio evidence", isConfirmed: false }],
        photos: { announcedCount: 0, uploadedCount: 0 },
      },
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === radio.table)?.values).toMatchObject({
      proposed_cell_id: 40,
      ...Object.fromEntries(Object.entries(radio.details).filter(([, value]) => value !== null)),
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values).toMatchObject({
      latitude: 52,
      longitude: 21,
      region_id: 1,
      move: "station",
      submission_id: submissionId,
    });
    expect(
      dbMock.calls.some(
        (call) =>
          call.operation !== "select" &&
          ["stations", "locations", "station_sectors", "cells", "gsm_cells", "umts_cells", "lte_cells", "nr_cells"].includes(call.table ?? ""),
      ),
    ).toBe(false);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      { entity: "submissions", op: "create", record_id: submissionId, new_values: { cells: [{ rat: radio.rat.toUpperCase() }] } },
    ]);
  });

  it("keeps each technology and local sector association distinct in a mixed radio draft", async () => {
    const fixture = draftFixture();
    scriptDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.cells).toMatchObject([
      { rat: "gsm", sectorKey: "north", lac: 65535, cid: 0 },
      { rat: "umts", sectorKey: "south", rnc: 65535, cid: 65535, uarfcn: 10562 },
      { rat: "lte", sectorKey: "north", enbid: 1048575, clid: 255, earfcn: 1200 },
      { rat: "nr", sectorKey: "south", mode: "sa", tac: 16777215, arfcn: 630000 },
    ]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "proposed_cells").map((call) => call.values)).toMatchObject([
      { rat: "GSM", sector_local_id: "north" },
      { rat: "UMTS", sector_local_id: "south" },
      { rat: "LTE", sector_local_id: "north" },
      { rat: "NR", sector_local_id: "south" },
    ]);
  });

  it("stores a proposed structure owner without creating the owner before review", async () => {
    const fixture = draftFixture([draftRadios[0]]);
    fixture.input.location = { ...fixture.input.location, structure: { type: "mast", ownerName: "New Owner", note: "Roof access" } };
    fixture.snapshot.proposedLocation = {
      ...fixture.snapshot.proposedLocation!,
      structure_type: "mast",
      structure_owner_name: "New Owner",
      structure_note: "Roof access",
    };
    scriptDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.location.structure).toEqual({ type: "mast", ownerId: null, ownerName: "New Owner", note: "Roof access" });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values).toMatchObject({
      structure_owner_id: null,
      structure_owner_name: "New Owner",
    });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "structure_owners")).toBe(false);
  });

  it.each(["user", "editor", "admin"] as const)("rejects a new owner proposal from a %s while proposals are disabled", async (role) => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const fixture = draftFixture([draftRadios[0]]);
    fixture.input.location = { ...fixture.input.location, structure: { ownerName: "Unlisted Owner" } };
    scriptDraftCreate(fixture);
    const response = await injectMutation(route, { ...request, payload: [fixture.input] }, { session: userSession(submitterId, role) });
    expectError(response, 403, "FEATURE_DISABLED");
    expect(response.json().errors[0].details).toEqual([{ field: "0/location/structure/ownerName" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => call.operation === "select")).toBe(true);
  });

  it("points a disabled owner proposal at the rejected batch item and saves none of the batch", async () => {
    getRuntimeSettings().structureOwnerProposalsEnabled = false;
    const first = draftFixture([draftRadios[0]]);
    const rejected = draftFixture([draftRadios[0]], "22222222-2222-4222-8222-222222222222", 100);
    rejected.input.location = { ...rejected.input.location, structure: { ownerName: "Unlisted Owner" } };
    scriptDraftBatchCreate([first, rejected]);
    const response = await injectMutation(route, { ...request, payload: [first.input, rejected.input] }, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(response.json().errors[0].details).toEqual([{ field: "1/location/structure/ownerName" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => call.operation === "select")).toBe(true);
  });

  it("works out an omitted region from coordinates and saves the resolved region in the draft", async () => {
    const fixture = draftFixture([draftRadios[0]]);
    fixture.input.location = { latitude: 52, longitude: 21, city: "Warsaw", address: "Example 1" };
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    scriptDraftCreate(fixture);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject({ ...request, payload: [fixture.input] });
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json().data[0].changes.location).toMatchObject({ latitude: 52, longitude: 21, regionId: 1 });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_locations")?.values).toMatchObject({ region_id: 1 });
  });

  it("requires an explicit region when the coordinates cannot be placed", async () => {
    const fixture = draftFixture([draftRadios[0]]);
    fixture.input.location = { latitude: 52, longitude: 21 };
    scriptDraftTranslation(fixture);
    dbMock.enqueueFor("execute", undefined, [{ regionId: null }]);
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
    expectError(
      await injectMutation(route, { ...request, payload: [fixture.input] }, options),
      400,
      "BAD_REQUEST",
      "No region could be worked out for these coordinates, send location.regionId",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([
    { description: "missing sector key", sectors: [{ action: "create", key: "other", azimuth: 90 }] },
    {
      description: "duplicate sector key",
      sectors: [
        { action: "create", key: "north", azimuth: 0 },
        { action: "create", key: "north", azimuth: 180 },
      ],
    },
    {
      description: "duplicate final azimuth",
      sectors: [
        { action: "create", key: "north", azimuth: 0 },
        { action: "create", key: "south", azimuth: 0 },
      ],
    },
  ])("rejects a draft with $description before beginning the transaction", async ({ sectors }) => {
    const fixture = draftFixture([draftRadios[0]]);
    scriptDraftTranslation(fixture);
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
    scriptDraftGeography();
    dbMock.query.stations.findFirst.mockResolvedValue(undefined);
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, { ...request, payload: [{ ...fixture.input, sectors }] }, options);
    expectError(response, 400, "BAD_REQUEST");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a site already registered at the proposed coordinates under another operator", async () => {
    const fixture = draftFixture([draftRadios[0]]);
    scriptDraftCreate(fixture);
    dbMock.query.locations.findFirst.mockResolvedValue({
      ...liveDraftLocation,
      stations: [stationRow({ station_id: "SITE-7", operator_id: 8, location_id: 2 })],
    });
    expectError(
      await injectMutation(route, { ...request, payload: [fixture.input] }, options),
      400,
      "BAD_REQUEST",
      "The station is already registered at this location",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => !["insert", "update", "delete"].includes(call.operation))).toBe(true);
  });

  it.each([
    { description: "the station detaches from its location", kind: "detach", message: "Cannot validate location_photo_ids: station has no location" },
    {
      description: "a selected photo leaves the station's location",
      kind: "select",
      message: "One or more location_photo_ids are invalid or do not belong to this station's location",
    },
    {
      description: "a photo to remove stops being shown by the station",
      kind: "remove",
      message: "One or more location_photo_ids_to_remove are not assigned to this station",
    },
  ] as const)("rechecks photo membership before saving when $description", async ({ kind, message }) => {
    const fixture = existingContentDraft();
    fixture.input.photos = kind === "remove" ? { removeIds: [submissionPhotoId] } : { selectIds: [submissionPhotoId] };
    dbMock.enqueueFor("select", "location_photos", [{ id: 70, fileId: submissionPhotoId }]);
    if (kind === "select") dbMock.enqueueFor("select", "location_photos", [{ value: 0 }]);
    if (kind === "remove") dbMock.enqueueFor("select", "station_photo_selections", [{ total: 1 }], [{ value: 0 }]);
    scriptContentDraftCreate(fixture);
    if (kind === "detach") dbMock.query.stations.findFirst.mockResolvedValue({ ...liveDraftStation, location_id: null, location: null });
    expectError(await injectMutation(route, { ...request, payload: [fixture.input] }, options), 400, "BAD_REQUEST", message);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => !["insert", "update", "delete"].includes(call.operation))).toBe(true);
  });

  it("rejects adding a sixteenth sector when the existing fifteen sectors remain", async () => {
    const fixture = existingContentDraft();
    fixture.input.sectors = [{ action: "create", key: "extra", azimuth: 15 }];
    scriptContentDraftCreate(fixture);
    dbMock.query.stations.findFirst.mockResolvedValue({
      ...liveDraftStation,
      sectors: Array.from({ length: 15 }, (_, index) => ({ id: index + 1, azimuth: index })),
    });
    expectError(
      await injectMutation(route, { ...request, payload: [fixture.input] }, options),
      400,
      "BAD_REQUEST",
      "A station can have at most 15 sectors",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => !["insert", "update", "delete"].includes(call.operation))).toBe(true);
  });

  it.each([
    { radio: draftRadios[2], second: { ...draftRadios[2].input, clid: 254 }, pci: 503, rat: "LTE" },
    { radio: draftRadios[3], second: { ...draftRadios[3].input, gnbid: 123457, clid: 8 }, pci: 1007, rat: "NR" },
  ])("rejects distinct $rat cell identities sharing a PCI, band, and channel", async ({ radio, second, pci, rat }) => {
    const fixture = draftFixture([radio]);
    fixture.input.cells = [{ ...radio.input }, second];
    scriptDraftCreate(fixture);
    expectError(
      await injectMutation(route, { ...request, payload: [fixture.input] }, options),
      400,
      "BAD_REQUEST",
      `Duplicate PCI ${pci} found on the same band in ${rat} cells`,
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.every((call) => !["insert", "update", "delete"].includes(call.operation))).toBe(true);
  });

  it.each([
    { name: "Contributor", username: "contributor", expected: "Contributor" },
    { name: "", username: "contributor", expected: "contributor" },
    { name: "", username: null, expected: "Unknown" },
  ])("identifies new submissions in staff notifications as $expected", async ({ name, username, expected }) => {
    scriptPreflight({ name, username });
    scriptAudit();
    const created = { ...submissionRow, pending_photos: 1 };
    const reviewerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    dbMock.enqueueFor("insert", "submissions", [created]);
    dbMock.enqueueFor("insert", "proposed_stations", []);
    scriptCountryStamp({ operatorId: 7 });
    dbMock.query.submissions.findFirst.mockResolvedValue({
      ...created,
      proposedStation: null,
      proposedLocation: null,
      proposedSectors: [],
      proposedCells: [],
    });
    dbMock.enqueueFor("select", "proposed_stations", [], [], []);
    dbMock.enqueueFor("select", "submissions", []);
    for (const table of ["proposed_locations", "proposed_cells", "proposed_sectors", "submission_location_photo_selections"])
      dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("select", "users", [
      { userId: reviewerId, role: "admin", countryCode: null, grantRole: null, isCountryWide: null, regionId: null },
    ]);
    scriptSubmissionSerialization();
    dbMock.enqueueFor("select", "users", [{ id: reviewerId, locale: "en-US" }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "22222222-2222-4222-8222-222222222222", userId: reviewerId }]);
    dbMock.enqueueFor("select", "push_subscriptions", []);
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "notifications")?.values).toMatchObject([
      {
        userId: reviewerId,
        type: "new_submission",
        submissionId,
        metadata: { submitter_name: expected, submission_type: "new" },
        actionUrl: `/admin/submissions/${submissionId}`,
      },
    ]);
  });

  it("reports the exact batch-indexed location field when draft validation rejects a generic address", async () => {
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
    dbMock.enqueueFor("select", "operators", [{ id: 7 }], [{ id: 7 }]);
    dbMock.enqueueFor("select", "regions", [{ id: 1 }]);
    const invalid = { ...change, location: { latitude: 52, longitude: 21, regionId: 1, address: "teren własny" } };
    const response = await injectMutation(route, { ...request, payload: [change, invalid] }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toContainEqual({
      field: "1/location/address",
      validationMessage: "Address must not contain variants of własny",
    });
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("rejects an update whose station no longer exists before translating any changes", async () => {
    dbMock.enqueueFor("select", "stations", []);
    expectError(
      await injectMutation(route, { ...request, payload: [{ action: "update", stationId: 12, note: "Evidence" }] }, options),
      404,
      "NOT_FOUND",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a session whose submitter account has disappeared", async () => {
    dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
    dbMock.enqueueFor("select", "users", []);
    expectError(await injectMutation(route, request, options), 401, "UNAUTHORIZED");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("creates a pending station proposal with announced photos without changing live data", async () => {
    scriptPreflight();
    scriptAudit();
    const created = { ...submissionRow, pending_photos: 1 };
    dbMock.enqueueFor("insert", "submissions", [created]);
    dbMock.enqueueFor("insert", "proposed_stations", []);
    scriptCountryStamp({ operatorId: 7 });
    dbMock.query.submissions.findFirst.mockResolvedValue({
      ...created,
      proposedStation: null,
      proposedLocation: null,
      proposedSectors: [],
      proposedCells: [],
    });
    dbMock.enqueueFor("select", "proposed_stations", [], [], []);
    dbMock.enqueueFor("select", "submissions", []);
    for (const table of ["proposed_locations", "proposed_cells", "proposed_sectors", "submission_location_photo_selections"])
      dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("select", "users", []);
    scriptSubmissionSerialization();
    const { app, errors } = await createRouteHarnessWithErrors(route, options);
    const response = await app.inject(request);
    expect(errors).toEqual([]);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      data: [{ id: submissionId, action: "create", status: "pending", changes: { photos: { announcedCount: 1, uploadedCount: 0 } } }],
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "submissions")?.values).toMatchObject({
      submitter_id: submitterId,
      station_id: null,
      type: "new",
      pending_photos: 1,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "proposed_stations")?.values).toMatchObject({
      station_id: "SITE-7",
      operator_id: 7,
      submission_id: submissionId,
    });
    expect(dbMock.calls.some((call) => call.operation !== "select" && call.table === "stations")).toBe(false);
  });

  it("requires an account", async () => {
    expectError(await injectMutation(route, request), 401, "UNAUTHORIZED");
  });

  it("rejects disabled submissions before any preflight", async () => {
    getRuntimeSettings().submissionsEnabled = false;
    expectError(await injectMutation(route, request, options), 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("requires an existing operator reference", async () => {
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: null }]);
    dbMock.enqueueFor("select", "operators", []);
    expectError(await injectMutation(route, request, options), 400, "BAD_REQUEST", "Operator 7 does not exist");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a country closed to contributions before creating proposals", async () => {
    dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: null }]);
    dbMock.enqueueFor("select", "operators", [{ id: 7 }], [{ id: 7, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    expectError(await injectMutation(route, request, options), 403, "FORBIDDEN", "This country is not accepting submissions");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("requires photos for a new station with no cells", async () => {
    scriptPreflight();
    expectError(
      await injectMutation(route, { ...request, payload: [{ action: "create", station: change.station }] }, options),
      400,
      "BAD_REQUEST",
      "At least one photo is required when submitting a new station without cells",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects an already registered station instead of silently duplicating it", async () => {
    scriptPreflight();
    dbMock.query.stations.findFirst.mockResolvedValue({ id: 12 });
    expectError(
      await injectMutation(route, request, options),
      400,
      "BAD_REQUEST",
      "A station with this station ID and operator already exists; update that station instead",
    );
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("preflights every change before creating any member of a batch", async () => {
    scriptPreflight();
    dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
    const response = await injectMutation(
      route,
      { ...request, payload: [change, { action: "create", station: { siteId: "SITE-8", operatorId: 7 } }] },
      options,
    );
    expectError(response, 400, "BAD_REQUEST");
    expect(response.json().errors[0].details).toEqual([{ field: "1" }]);
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("reports a proposal insert that returned no submission", async () => {
    scriptPreflight();
    scriptAudit();
    dbMock.enqueueFor("insert", "submissions", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_CREATE");
  });

  it.each([
    { payload: [] },
    { payload: Array.from({ length: 51 }, () => change) },
    { payload: [{ action: "update" }] },
    { payload: [{ ...change, stationId: 12 }] },
    { payload: [{ action: "delete", stationId: 12, station: { notes: "Unexpected" } }] },
    { payload: [{ ...change, photos: { uploadCount: 0 } }] },
  ])("enforces the action and batch contract %j", async ({ payload }) => {
    expectError(await injectMutation(route, { ...request, payload }, options), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects analyzer changes beyond the user's 32-hour allowance with a retry header", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "submissions", [{ total: 100, oldestAt: new Date() }]);
    const response = await injectMutation(route, { ...request, payload: [{ ...change, origin: "analyzer" }] }, options);
    expectError(response, 429, "TOO_MANY_REQUESTS", "At most 100 analyzer changes in 32 hours");
    expect(Number(response.headers["x-retry-after"])).toBeGreaterThan(0);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("counts every analyzer change of a request against what is left of the allowance", async () => {
    const oldestAt = new Date(Date.now() - 31 * 60 * 60 * 1000);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "submissions", [{ total: 99, oldestAt }]);
    const payload = [
      { ...change, origin: "analyzer" },
      { ...change, origin: "analyzer" },
    ];
    const response = await injectMutation(route, { ...request, payload }, options);
    expectError(response, 429, "TOO_MANY_REQUESTS", "At most 100 analyzer changes in 32 hours");
    expect(Number(response.headers["x-retry-after"])).toBeGreaterThan(3590);
    expect(Number(response.headers["x-retry-after"])).toBeLessThanOrEqual(3600);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a cell update that names no field before the analyzer allowance is counted", async () => {
    const payload = [
      { action: "update", stationId: 1, origin: "analyzer", cells: [{ action: "update", id: 100, pci: 301 }] },
      {
        action: "update",
        stationId: 2,
        origin: "analyzer",
        cells: [
          { action: "delete", id: 200 },
          { action: "update", id: 201 },
        ],
      },
    ];
    const response = await injectMutation(route, { ...request, payload }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([
      { field: "1/cells/1", validationMessage: "A cell update needs at least one field to change" },
    ]);
    expect(dbMock.calls).toEqual([]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("reports only the unknown key of a cell update that names no other field", async () => {
    const cells = [{ action: "update", id: 100, isConfirmed: true }];
    const response = await injectMutation(route, { ...request, payload: [{ action: "update", stationId: 1, cells }] }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "0/cells/0", validationMessage: 'Unrecognized key: "isConfirmed"' }]);
    expect(dbMock.calls).toEqual([]);
  });

  it.each([
    {
      title: "an update with a value of the wrong type",
      cell: { action: "update", id: 100, pci: "x" },
      details: [{ field: "0/cells/0/pci", validationMessage: "Invalid input: expected number, received string" }],
    },
    {
      title: "an update with two values of the wrong type",
      cell: { action: "update", id: 100, pci: "x", tac: "y" },
      details: [
        { field: "0/cells/0/tac", validationMessage: "Invalid input: expected number, received string" },
        { field: "0/cells/0/pci", validationMessage: "Invalid input: expected number, received string" },
      ],
    },
    {
      title: "an update without an id",
      cell: { action: "update", pci: 4 },
      details: [{ field: "0/cells/0/id", validationMessage: "Invalid input: expected number, received undefined" }],
    },
    {
      title: "an update whose id is a string",
      cell: { action: "update", id: "100", pci: 4 },
      details: [{ field: "0/cells/0/id", validationMessage: "Invalid input: expected number, received string" }],
    },
    {
      title: "a delete without an id",
      cell: { action: "delete" },
      details: [{ field: "0/cells/0/id", validationMessage: "Invalid input: expected number, received undefined" }],
    },
  ])("points at the invalid field of $title", async ({ cell, details }) => {
    const response = await injectMutation(route, { ...request, payload: [{ action: "update", stationId: 1, cells: [cell] }] }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual(details);
    expect(dbMock.calls).toEqual([]);
  });

  it.each([{ notes: null }, { bandId: 3 }, { sectorId: null }, { cellType: null }, { pci: null }, { supportsIot: false }])(
    "lets a cell update that only sets %j past the contract",
    async (field) => {
      dbMock.enqueueFor("select", "stations", []);
      const cells = [{ action: "update", id: 100, ...field }];
      const response = await injectMutation(route, { ...request, payload: [{ action: "update", stationId: 1, cells }] }, options);
      expectError(response, 404, "NOT_FOUND");
      expect(response.json().errors[0].details).toEqual([{ field: "0" }]);
    },
  );
});

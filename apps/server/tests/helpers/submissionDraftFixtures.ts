import type { proposedGSMCells, proposedLTECells, proposedNRCells, proposedUMTSCells } from "@openbts/drizzle";
import type { SubmissionCreate, SubmissionUpdate, SubmittedCellInput } from "@openbts/shared/contract";
import type { z } from "zod/v4";

import type { LocationRow } from "../../src/features/locations/write.js";
import type { ProposedLocationRow, ProposedStationRow } from "../../src/features/submissions/helpers.js";
import type { proposedCellsSelectSchema } from "../../src/features/submissions/helpers.js";
import type { SubmissionRow } from "../../src/features/submissions/read.js";
import type { ProposedSectorRow } from "../../src/features/submissions/serialize.js";
import { authBoundary, dbMock } from "./boundaries.js";
import { cellBands, storedCell } from "./cellWriteFixtures.js";
import { scriptAudit } from "./mutationAssertions.js";
import { readLocation } from "./readFixtures.js";
import { stationRow } from "./stationFixtures.js";
import { scriptCountryStamp, submissionId, submissionRow } from "./submissionFixtures.js";

export const draftRadios = [
  {
    rat: "gsm",
    input: { action: "create", rat: "gsm", bandId: 1, lac: 65535, cid: 0, isEGsm: true },
    details: { lac: 65535, cid: 0, e_gsm: true, bsic: null },
    table: "proposed_gsm_cells",
    identityTable: "gsm_cells",
  },
  {
    rat: "umts",
    input: { action: "create", rat: "umts", bandId: 2, rnc: 65535, cid: 65535, lac: 0, uarfcn: 10562 },
    details: { rnc: 65535, cid: 65535, lac: 0, psc: null, arfcn: 10562 },
    table: "proposed_umts_cells",
    identityTable: "umts_cells",
  },
  {
    rat: "lte",
    input: { action: "create", rat: "lte", bandId: 3, enbid: 1048575, clid: 255, tac: 0, pci: 503, earfcn: 1200, supportsIot: true },
    details: { enbid: 1048575, clid: 255, tac: 0, pci: 503, earfcn: 1200, supports_iot: true },
    table: "proposed_lte_cells",
    identityTable: "lte_cells",
  },
  {
    rat: "nr",
    input: {
      action: "create",
      rat: "nr",
      bandId: 4,
      mode: "sa",
      gnbid: 123456,
      clid: 7,
      tac: 16777215,
      pci: 1007,
      arfcn: 630000,
      supportsRedCap: true,
    },
    details: { type: "sa", gnbid: 123456, gnbid_length: null, clid: 7, nrtac: 16777215, pci: 1007, arfcn: 630000, supports_nr_redcap: true },
    table: "proposed_nr_cells",
    identityTable: null,
  },
] as const satisfies readonly {
  rat: string;
  input: SubmittedCellInput;
  details: Record<string, unknown>;
  table: string;
  identityTable: string | null;
}[];

type DraftRadio = (typeof draftRadios)[number];
const databaseRats = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" } as const;
type DraftCellRows = {
  cell: z.infer<typeof proposedCellsSelectSchema>;
  gsm: typeof proposedGSMCells.$inferSelect | null;
  umts: typeof proposedUMTSCells.$inferSelect | null;
  lte: typeof proposedLTECells.$inferSelect | null;
  nr: typeof proposedNRCells.$inferSelect | null;
};
type DraftSnapshot = SubmissionRow & {
  proposedStation: ProposedStationRow | null;
  proposedLocation: ProposedLocationRow | null;
  proposedSectors: ProposedSectorRow[];
  proposedCells: (DraftCellRows["cell"] & Omit<DraftCellRows, "cell">)[];
};
type DraftFixture = {
  input: SubmissionCreate;
  row: SubmissionRow;
  snapshot: DraftSnapshot;
  sectors: ProposedSectorRow[];
  cells: DraftCellRows[];
  radios: readonly DraftRadio[];
};

export const draftStation: ProposedStationRow = {
  id: 10,
  submission_id: submissionId,
  operation: "add",
  target_station_id: null,
  station_id: "SITE-7",
  operator_id: 7,
  notes: "Station evidence",
  networks_id: 123,
  networks_name: "Network name",
  mno_name: "Operator name",
  uplink_type: "fiber",
  uplink_speed: 1000,
  uplink_model: "Router",
  is_confirmed: false,
  changed_fields: null,
  createdAt: submissionRow.createdAt,
  updatedAt: submissionRow.updatedAt,
};

export const draftLocation: ProposedLocationRow = {
  id: 20,
  submission_id: submissionId,
  region_id: 1,
  city: "Warsaw",
  address: "Example 1",
  latitude: 52,
  longitude: 21,
  structure_type: null,
  structure_owner_id: null,
  structure_owner_name: null,
  structure_note: null,
  move: "station",
  changed_fields: null,
  createdAt: submissionRow.createdAt,
  updatedAt: submissionRow.updatedAt,
};

export function draftFixture(radios: readonly DraftRadio[] = draftRadios, id = submissionId, offset = 0): DraftFixture {
  const sectors: ProposedSectorRow[] = [
    {
      id: 30 + offset,
      submission_id: id,
      operation: "add",
      target_sector_id: null,
      local_id: "north",
      azimuth: 0,
      createdAt: submissionRow.createdAt,
      updatedAt: submissionRow.updatedAt,
    },
    {
      id: 31 + offset,
      submission_id: id,
      operation: "add",
      target_sector_id: null,
      local_id: "south",
      azimuth: 180,
      createdAt: submissionRow.createdAt,
      updatedAt: submissionRow.updatedAt,
    },
  ];
  const cells: DraftCellRows[] = radios.map((radio, index) => {
    const cellId = 40 + offset + index;
    const cell: z.infer<typeof proposedCellsSelectSchema> = {
      id: cellId,
      submission_id: id,
      target_cell_id: null,
      station_id: null,
      band_id: radio.input.bandId,
      target_sector_id: null,
      sector_local_id: index % 2 === 0 ? "north" : "south",
      sector_unassigned: false,
      rat: databaseRats[radio.rat],
      type: "MACROCELL",
      notes: "Radio evidence",
      is_confirmed: false,
      operation: "add",
      createdAt: submissionRow.createdAt,
      updatedAt: submissionRow.updatedAt,
    };
    const rows: DraftCellRows = { cell, gsm: null, umts: null, lte: null, nr: null };
    if (radio.rat === "gsm") rows.gsm = { ...radio.details, proposed_cell_id: cellId };
    if (radio.rat === "umts") rows.umts = { ...radio.details, proposed_cell_id: cellId };
    if (radio.rat === "lte") rows.lte = { ...radio.details, proposed_cell_id: cellId };
    if (radio.rat === "nr") rows.nr = { ...radio.details, proposed_cell_id: cellId };
    return rows;
  });
  const input: SubmissionCreate = {
    action: "create",
    note: "Field measurements",
    station: {
      siteId: "SITE-7",
      operatorId: 7,
      notes: "Station evidence",
      identifiers: [
        { kind: "networksId", value: "123" },
        { kind: "networksName", value: "Network name" },
        { kind: "operatorName", value: "Operator name" },
      ],
      backhaul: { medium: "fiber", speedMbps: 1000, model: "Router" },
    },
    location: { regionId: 1, latitude: 52, longitude: 21, city: "Warsaw", address: "Example 1" },
    sectors: [
      { action: "create", key: "north", azimuth: 0 },
      { action: "create", key: "south", azimuth: 180 },
    ],
    cells: radios.map((radio, index) => ({
      ...radio.input,
      sectorKey: index % 2 === 0 ? "north" : "south",
      cellType: "macro",
      notes: "Radio evidence",
    })),
  };
  const row: SubmissionRow = { ...submissionRow, id, submitter_note: "Field measurements" };
  const snapshot: DraftSnapshot = {
    ...row,
    proposedStation: { ...draftStation, id: 10 + offset, submission_id: id },
    proposedLocation: { ...draftLocation, id: 20 + offset, submission_id: id },
    proposedSectors: sectors,
    proposedCells: cells.map(({ cell, ...radio }) => ({ ...cell, ...radio })),
  };
  return { input, row, snapshot, sectors, cells, radios };
}

export const liveDraftLocation: LocationRow = {
  ...readLocation.location,
  id: 2,
  city: "Warsaw",
  address: "Example 1",
  structure_type: "mast",
  structure_owner_id: 9,
  structure_note: "Live structure",
  point: { x: 21, y: 52 },
};
export const liveDraftStation = {
  ...stationRow({ station_id: "SITE-LIVE", operator_id: 7, location_id: 2, notes: "Live notes" }),
  location: liveDraftLocation,
  sectors: [],
};
export const liveDraftIdentifiers = {
  id: 1,
  station_id: 1,
  networks_id: 123,
  networks_name: "Live Network",
  mno_name: "Live Operator",
  createdAt: submissionRow.createdAt,
  updatedAt: submissionRow.updatedAt,
};
export const liveDraftBackhaul = {
  id: 1,
  station_id: 1,
  type: "microwave",
  speed: 1000,
  model: "Live Router",
  createdAt: submissionRow.createdAt,
  updatedAt: submissionRow.updatedAt,
};

export function existingContentDraft(): DraftFixture {
  const fixture = draftFixture([]);
  fixture.row = { ...fixture.row, type: "update", station_id: 1, submitter_note: null };
  fixture.input = { action: "update", stationId: 1 };
  fixture.sectors = [];
  fixture.snapshot = { ...fixture.snapshot, ...fixture.row, proposedStation: null, proposedLocation: null, proposedSectors: [] };
  return fixture;
}

export function scriptContentDraftCreate(fixture: DraftFixture): void {
  dbMock.enqueueFor("select", "stations", [{ station: liveDraftStation, countryCode: null }]);
  const structure = fixture.input.location?.structure;
  if (fixture.input.location?.regionId === undefined && (typeof structure?.ownerId === "number" || structure?.ownerName !== undefined))
    dbMock.enqueueFor("select", "stations", [{ regionId: 1 }]);
  if (fixture.input.station?.operatorId !== undefined) dbMock.enqueueFor("select", "operators", [{ id: fixture.input.station.operatorId }]);
  if (fixture.input.location?.regionId !== undefined) dbMock.enqueueFor("select", "regions", [{ id: fixture.input.location.regionId }]);
  if (fixture.input.location?.structure?.ownerName !== undefined) {
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "structure_owners", []);
  }
  if (typeof fixture.input.location?.structure?.ownerId === "number") {
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "structure_owners", [{ countryCode: "PL" }]);
  }
  dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
  if (fixture.input.location !== undefined) dbMock.enqueueFor("select", "stations", [{ stationId: 1, region_id: 1, latitude: 52, longitude: 21 }]);
  dbMock.enqueueFor("select", "stations", [{ countryCode: "PL", regionId: 1 }]);
  if (fixture.input.location?.latitude !== undefined || fixture.input.location?.regionId !== undefined) {
    dbMock.enqueueFor("execute", undefined, [{ regionId: fixture.input.location.regionId ?? 1 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL", regionId: fixture.input.location.regionId ?? 1 }]);
  }
  if (fixture.input.station?.operatorId !== undefined && fixture.input.location === undefined)
    dbMock.enqueueFor("select", "stations", [{ id: 1, locationId: 2, operatorId: 7 }]);
  dbMock.enqueueFor("select", "countries", []);
  dbMock.query.stations.findFirst.mockResolvedValue(liveDraftStation);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(liveDraftIdentifiers);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(liveDraftBackhaul);
  scriptAudit();
  dbMock.enqueueFor("insert", "submissions", [fixture.row]);
  if (fixture.snapshot.proposedStation !== null) dbMock.enqueueFor("insert", "proposed_stations", []);
  if (fixture.snapshot.proposedLocation !== null) dbMock.enqueueFor("insert", "proposed_locations", []);
  scriptCountryStamp({
    stationId: 1,
    regionId: fixture.snapshot.proposedLocation?.region_id,
    operatorId: fixture.snapshot.proposedStation?.operator_id,
  });
  dbMock.query.submissions.findFirst.mockResolvedValue(fixture.snapshot);
  dbMock.enqueueFor("select", "proposed_stations", [], [], []);
  dbMock.enqueueFor(
    "select",
    "stations",
    [{ id: 1, stationId: "SITE-LIVE", operatorName: "Operator", operatorMnc: 7 }],
    [{ countryCode: "PL", regionId: 1 }],
  );
  dbMock.enqueueFor("select", "submissions", [{ stationId: 1 }]);
  if (fixture.snapshot.proposedLocation === null) {
    dbMock.enqueueFor("select", "proposed_locations", []);
  } else {
    const location = fixture.snapshot.proposedLocation;
    dbMock.enqueueFor("select", "proposed_locations", [
      { region_id: location.region_id, latitude: location.latitude, longitude: location.longitude, current: liveDraftLocation },
    ]);
    dbMock.enqueueFor("execute", undefined, [{ regionId: location.region_id ?? 1 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL", regionId: location.region_id ?? 1 }]);
    if (location.latitude !== null && location.longitude !== null) dbMock.enqueueFor("select", "locations", []);
  }
  for (const table of ["proposed_cells", "proposed_sectors", "submission_location_photo_selections"]) dbMock.enqueueFor("select", table, []);
  dbMock.enqueueFor("select", "users", []);
  scriptDraftSerialization(fixture);
}

export function existingDraftFixture(
  radios: readonly DraftRadio[],
  action: "update" | "delete" = "update",
): { fixture: DraftFixture; targets: ReturnType<typeof storedCell>[] } {
  const fixture = draftFixture(radios);
  fixture.row = { ...fixture.row, type: "update", station_id: 1 };
  const targets = radios.map((radio, index) => storedCell({ ...radio.input, notes: "Stored evidence" }, 100 + index, 1));
  fixture.input = {
    action: "update",
    stationId: 1,
    cells: targets.map(({ cell }) => ({ action, id: cell.id, ...(action === "update" ? { notes: null } : {}) })),
  };
  fixture.sectors = [];
  fixture.cells = fixture.cells.map((rows, index) => ({
    ...rows,
    cell: {
      ...rows.cell,
      target_cell_id: targets[index]!.cell.id,
      station_id: 1,
      operation: action,
      notes: action === "update" ? "" : "Stored evidence",
      type: null,
      sector_local_id: null,
    },
    ...(action === "delete" ? { gsm: null, umts: null, lte: null, nr: null } : {}),
  }));
  fixture.snapshot = {
    ...fixture.snapshot,
    ...fixture.row,
    proposedStation: null,
    proposedLocation: null,
    proposedSectors: [],
    proposedCells: fixture.cells.map(({ cell, ...radio }) => ({ ...cell, ...radio })),
  };
  return { fixture, targets };
}

export function scriptExistingDraftCreate(fixture: DraftFixture, targets: ReturnType<typeof storedCell>[]): void {
  const station = stationRow({ operator_id: 7, sectors: [], location: null });
  dbMock.enqueueFor("select", "stations", [{ station, countryCode: null }], [{ regionId: 1, countryCode: "PL" }]);
  dbMock.enqueueFor("select", "cells", targets);
  dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
  dbMock.enqueueFor("select", "countries", []);
  dbMock.query.stations.findFirst.mockResolvedValue(station);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
  dbMock.query.cells.findMany.mockResolvedValue(targets.map(({ cell }) => cell));
  dbMock.enqueueFor("select", "stations", [{ locationCountry: "PL", operatorCountry: "PL" }]);
  if (fixture.cells.some(({ cell }) => cell.operation !== "delete")) {
    scriptBandPlan();
    for (const radio of fixture.radios) {
      if (radio.identityTable !== null) dbMock.enqueueFor("select", radio.identityTable, []);
      if (radio.rat === "lte" || radio.rat === "nr") dbMock.enqueueFor("select", `${radio.rat}_cells`, []);
    }
  }
  scriptAudit();
  dbMock.enqueueFor("insert", "submissions", [fixture.row]);
  for (const [index, radio] of fixture.radios.entries()) {
    dbMock.enqueueFor("insert", "proposed_cells", [fixture.cells[index]!.cell]);
    if (fixture.cells[index]!.cell.operation !== "delete") dbMock.enqueueFor("insert", radio.table, []);
  }
  scriptCountryStamp({ stationId: 1 });
  dbMock.query.submissions.findFirst.mockResolvedValue(fixture.snapshot);
  dbMock.enqueueFor("select", "proposed_stations", [], [], []);
  dbMock.enqueueFor(
    "select",
    "stations",
    [{ id: 1, stationId: "A1", operatorName: "Operator", operatorMnc: 7 }],
    [{ regionId: 1, countryCode: "PL" }],
  );
  dbMock.enqueueFor("select", "submissions", [{ stationId: 1 }]);
  dbMock.enqueueFor("select", "proposed_locations", []);
  dbMock.enqueueFor(
    "select",
    "proposed_cells",
    fixture.cells.map(({ cell }) => ({ cellId: cell.target_cell_id, stationId: 1, sectorId: null })),
  );
  dbMock.enqueueFor(
    "select",
    "cells",
    targets.map(() => ({ stationId: 1 })),
  );
  dbMock.enqueueFor("select", "proposed_sectors", []);
  dbMock.enqueueFor("select", "submission_location_photo_selections", []);
  dbMock.enqueueFor("select", "users", []);
  scriptDraftSerialization(fixture);
}

export function scriptDraftTranslation(fixture: DraftFixture): void {
  dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
  if (fixture.input.location?.regionId !== undefined) dbMock.enqueueFor("select", "regions", [{ id: 1 }]);
  dbMock.enqueueFor(
    "select",
    "bands",
    fixture.radios.map((radio) => ({ id: radio.input.bandId })),
  );
  if (fixture.input.location?.structure?.ownerName !== undefined) {
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "structure_owners", []);
  }
}

export function scriptDraftGeography(options: { placement?: boolean } = {}): void {
  dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
  dbMock.enqueueFor("select", "regions", [{ regionId: 1, countryCode: "PL" }]);
  if (options.placement) dbMock.enqueueFor("select", "operators", [{ id: 7, countryCode: "PL" }]);
  dbMock.enqueueFor("select", "countries", []);
}

function scriptBandPlan(): void {
  dbMock.enqueueFor("select", "bands", cellBands);
  dbMock.enqueueFor(
    "select",
    "country_bands",
    cellBands.map(({ id }) => ({ bandId: id })),
  );
}

export function scriptDraftSerialization(fixture: DraftFixture, role = "user"): void {
  scriptDraftBatchSerialization([fixture], role);
}

function scriptDraftBatchSerialization(fixtures: DraftFixture[], role = "user"): void {
  dbMock.enqueueFor(
    "select",
    "proposed_stations",
    fixtures.flatMap((fixture) => (fixture.snapshot.proposedStation === null ? [] : [fixture.snapshot.proposedStation])),
  );
  dbMock.enqueueFor(
    "select",
    "proposed_locations",
    fixtures.flatMap((fixture) => (fixture.snapshot.proposedLocation === null ? [] : [fixture.snapshot.proposedLocation])),
  );
  dbMock.enqueueFor(
    "select",
    "proposed_sectors",
    fixtures.flatMap((fixture) => fixture.sectors),
  );
  dbMock.enqueueFor(
    "select",
    "proposed_cells",
    fixtures.flatMap((fixture) => fixture.cells),
  );
  dbMock.enqueueFor("select", "submission_location_photo_selections", []);
  dbMock.enqueueFor("select", "submission_photos", []);
  dbMock.enqueueFor("select", "users", [], [{ role }]);
  dbMock.enqueueFor("select", "role_grants", []);
  if (fixtures.some((fixture) => fixture.cells.length > 0)) dbMock.enqueueFor("select", "bands", []);
}

export function scriptDraftCreate(fixture: DraftFixture): void {
  scriptDraftBatchCreate([fixture]);
}

export function scriptDraftBatchCreate(fixtures: DraftFixture[]): void {
  for (const fixture of fixtures) scriptDraftTranslation(fixture);
  dbMock.enqueueFor("select", "users", [{ name: "Contributor", username: "contributor" }]);
  scriptDraftGeography();
  for (const fixture of fixtures) {
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptBandPlan();
    for (const radio of fixture.radios) if (radio.identityTable !== null) dbMock.enqueueFor("select", radio.identityTable, []);
  }
  dbMock.query.stations.findFirst.mockResolvedValue(undefined);
  dbMock.query.locations.findFirst.mockResolvedValue(undefined);
  scriptAudit();
  for (const fixture of fixtures) {
    dbMock.enqueueFor("insert", "submissions", [fixture.row]);
    dbMock.enqueueFor("insert", "proposed_stations", []);
    dbMock.enqueueFor("insert", "proposed_locations", []);
    dbMock.enqueueFor("insert", "proposed_sectors", []);
    for (const [index, radio] of fixture.radios.entries()) {
      dbMock.enqueueFor("insert", "proposed_cells", [fixture.cells[index]!.cell]);
      dbMock.enqueueFor("insert", radio.table, []);
    }
    scriptCountryStamp({ regionId: fixture.snapshot.proposedLocation?.region_id, operatorId: fixture.snapshot.proposedStation?.operator_id });
    dbMock.query.submissions.findFirst.mockResolvedValueOnce(fixture.snapshot);
  }
  dbMock.enqueueFor(
    "select",
    "proposed_stations",
    fixtures.map((fixture) => ({ submissionId: fixture.row.id, stationId: fixture.input.station?.siteId, operatorName: "Operator", operatorMnc: 7 })),
  );
  for (const fixture of fixtures) {
    dbMock.enqueueFor("select", "proposed_stations", [{ stationId: null }], []);
    dbMock.enqueueFor("select", "submissions", [{ stationId: null }]);
    dbMock.enqueueFor("select", "proposed_locations", [{ region_id: 1, longitude: 21, latitude: 52, current: null }]);
    dbMock.enqueueFor(
      "select",
      "proposed_cells",
      fixture.cells.map(() => ({ cellId: null, stationId: null, sectorId: null })),
    );
    dbMock.enqueueFor(
      "select",
      "proposed_sectors",
      fixture.sectors.map(() => ({ sectorId: null })),
    );
    dbMock.enqueueFor("select", "submission_location_photo_selections", []);
    dbMock.enqueueFor("select", "locations", []);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ regionId: 1, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "users", []);
  }
  scriptDraftBatchSerialization(fixtures);
}

export function scriptDraftUpdate(
  fixture: DraftFixture,
  body: SubmissionUpdate,
  options: {
    old?: DraftFixture;
    role?: "user" | "admin";
    countryCode?: string | null;
    lookupRetainedOwner?: boolean;
    retainedOwnerRegions?: { id: number; countryCode: string }[];
  } = {},
): void {
  const previous = options.old ?? draftFixture([draftRadios[0]]);
  dbMock.enqueueSubmissionPlacement([
    { regionId: previous.snapshot.proposedLocation?.region_id ?? null, operatorId: previous.snapshot.proposedStation?.operator_id ?? null },
  ]);
  const role = options.role ?? "user";
  authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: role === "admin" });
  if (role === "admin") {
    dbMock.enqueueFor("select", "users", [{ role }]);
    dbMock.enqueueFor("select", "role_grants", []);
  }
  dbMock.query.submissions.findFirst
    .mockResolvedValueOnce(previous.row)
    .mockResolvedValueOnce(previous.snapshot)
    .mockResolvedValueOnce(fixture.snapshot);
  if (body.station !== undefined) dbMock.enqueueFor("select", "operators", [{ id: 7 }]);
  if (body.location?.regionId !== undefined) dbMock.enqueueFor("select", "regions", [{ id: 1 }]);
  if (body.cells?.length)
    dbMock.enqueueFor(
      "select",
      "bands",
      fixture.radios.map((radio) => ({ id: radio.input.bandId })),
    );
  if (body.location?.structure?.ownerName !== undefined || options.lookupRetainedOwner) {
    dbMock.enqueueFor("select", "regions", [{ countryCode: options.countryCode === undefined ? "PL" : options.countryCode }]);
    dbMock.enqueueFor("select", "structure_owners", []);
  }
  if (typeof body.location?.structure?.ownerId === "number") {
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "structure_owners", [{ countryCode: "PL" }]);
  }
  if (options.retainedOwnerRegions) dbMock.enqueueFor("select", "regions", options.retainedOwnerRegions);
  if (body.location !== undefined) {
    scriptDraftGeography({ placement: body.station !== undefined });
  } else if (body.station !== undefined) {
    dbMock.enqueueFor("select", "operators", [{ id: 7, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", []);
  }
  if (body.sectors?.length === 0) dbMock.query.proposedSectors.findFirst.mockResolvedValue(previous.sectors[0]);
  if (body.cells?.length === 0) dbMock.query.proposedCells.findFirst.mockResolvedValue(previous.cells[0]?.cell);
  if (body.sectors !== undefined || body.cells !== undefined) {
    dbMock.query.proposedSectors.findMany.mockResolvedValue(previous.sectors);
    dbMock.query.proposedCells.findMany.mockResolvedValue(previous.cells.map(({ cell }) => cell));
  }
  if (body.cells?.length) {
    if (body.location === undefined) dbMock.query.proposedLocations.findFirst.mockResolvedValue(previous.snapshot.proposedLocation);
    if (body.station === undefined) dbMock.query.proposedStations.findFirst.mockResolvedValue(previous.snapshot.proposedStation);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptBandPlan();
  }
  scriptAudit();
  dbMock.enqueueFor("select", "submissions", [{ status: previous.row.status, updatedAt: previous.row.updatedAt }]);
  dbMock.enqueueFor("update", "submissions", []);
  if (body.station !== undefined) {
    dbMock.enqueueFor("delete", "proposed_stations", []);
    dbMock.enqueueFor("insert", "proposed_stations", []);
  }
  if (body.location !== undefined) {
    dbMock.query.proposedLocations.findFirst.mockResolvedValue(previous.snapshot.proposedLocation);
    dbMock.enqueueFor("delete", "proposed_locations", [{ move: previous.snapshot.proposedLocation?.move }]);
    dbMock.enqueueFor("insert", "proposed_locations", []);
  }
  if (body.sectors !== undefined) {
    dbMock.enqueueFor("delete", "proposed_sectors", []);
    if (body.sectors.length > 0) dbMock.enqueueFor("insert", "proposed_sectors", []);
  }
  if (body.cells !== undefined) {
    dbMock.enqueueFor("delete", "proposed_cells", []);
    if (body.cells.length > 0) {
      dbMock.enqueueFor(
        "insert",
        "proposed_cells",
        fixture.cells.map(({ cell }) => ({ id: cell.id })),
      );
      for (const radio of fixture.radios) dbMock.enqueueFor("insert", radio.table, []);
    }
  }
  if (body.station !== undefined || body.location !== undefined) {
    const placement = {
      stationId: fixture.row.station_id,
      regionId: fixture.snapshot.proposedLocation?.region_id,
      operatorId: fixture.snapshot.proposedStation?.operator_id,
    };
    scriptCountryStamp(placement, options.countryCode);
  }
  dbMock.enqueueFor("select", "submissions", [fixture.row]);
  scriptDraftSerialization(fixture, role);
}

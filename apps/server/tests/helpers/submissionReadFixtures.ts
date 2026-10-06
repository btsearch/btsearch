import type {
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedSectors,
  proposedStations,
  proposedUMTSCells,
} from "@openbts/drizzle";

import { dbMock } from "./boundaries.js";
import { submissionId } from "./submissionFixtures.js";

export const foreignReaderId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const proposalDate = new Date("2026-01-02T12:00:00Z");

export const proposedStation: typeof proposedStations.$inferSelect = {
  id: 1,
  submission_id: submissionId,
  operation: "update",
  target_station_id: 1,
  station_id: "Draft site",
  operator_id: 7,
  notes: null,
  networks_id: 0,
  networks_name: null,
  mno_name: "Draft name",
  uplink_type: "microwave",
  uplink_speed: 100,
  uplink_model: null,
  changed_fields: ["station_id", "operator_id", "notes", "networks_id", "networks_name", "mno_name", "uplink_type", "uplink_speed", "uplink_model"],
  is_confirmed: false,
  createdAt: proposalDate,
  updatedAt: proposalDate,
};

export const proposedLocation: typeof proposedLocations.$inferSelect = {
  id: 1,
  submission_id: submissionId,
  region_id: 1,
  city: null,
  address: "Draft address",
  structure_type: "rooftop_mast",
  structure_owner_id: null,
  structure_owner_name: "New owner",
  structure_note: null,
  latitude: 52,
  longitude: 21,
  move: "location",
  changed_fields: ["region_id", "city", "address", "structure_type", "structure_owner_id", "structure_note", "latitude", "longitude"],
  createdAt: proposalDate,
  updatedAt: proposalDate,
};

export type ProposedCellView = {
  cell: typeof proposedCells.$inferSelect;
  gsm: Omit<typeof proposedGSMCells.$inferSelect, "proposed_cell_id"> | null;
  umts: Omit<typeof proposedUMTSCells.$inferSelect, "proposed_cell_id"> | null;
  lte: Omit<typeof proposedLTECells.$inferSelect, "proposed_cell_id"> | null;
  nr: Omit<typeof proposedNRCells.$inferSelect, "proposed_cell_id"> | null;
};

export function proposedCell(overrides: Partial<ProposedCellView["cell"]> = {}): ProposedCellView {
  return {
    cell: {
      id: 1,
      submission_id: submissionId,
      operation: "add",
      target_cell_id: null,
      station_id: null,
      band_id: 3,
      target_sector_id: null,
      sector_local_id: "north",
      sector_unassigned: false,
      rat: "GSM",
      type: "MACROCELL",
      notes: "Draft note",
      is_confirmed: false,
      createdAt: proposalDate,
      updatedAt: proposalDate,
      ...overrides,
    },
    gsm: null,
    umts: null,
    lte: null,
    nr: null,
  };
}

type Projection = {
  stationRows?: (typeof proposedStation)[];
  locationRows?: (typeof proposedLocation)[];
  sectorRows?: (typeof proposedSectors.$inferSelect)[];
  cellRows?: ProposedCellView[];
  pickRows?: unknown[];
  uploadRows?: { submissionId: string; total: number }[];
  userRows?: unknown[];
  role?: "user" | "editor" | "admin";
  accessLoaded?: boolean;
  hasUsers?: boolean;
};

export function scriptSubmissionRead({
  stationRows = [],
  locationRows = [],
  sectorRows = [],
  cellRows = [],
  pickRows = [],
  uploadRows = [],
  userRows = [],
  role = "user",
  accessLoaded = false,
  hasUsers = true,
}: Projection = {}) {
  dbMock.enqueueFor("select", "proposed_stations", stationRows);
  dbMock.enqueueFor("select", "proposed_locations", locationRows);
  dbMock.enqueueFor("select", "proposed_sectors", sectorRows);
  dbMock.enqueueFor("select", "proposed_cells", cellRows);
  dbMock.enqueueFor("select", "submission_location_photo_selections", pickRows);
  dbMock.enqueueFor("select", "submission_photos", uploadRows);
  if (!accessLoaded) scriptReaderAccess(role);
  if (hasUsers) dbMock.enqueueFor("select", "users", userRows);
  if (cellRows.length > 0) dbMock.enqueueFor("select", "bands", [{ id: 99 }]);
}

export function scriptReaderAccess(role: "user" | "editor" | "admin", isCountryWide = false) {
  dbMock.enqueueFor("select", "users", [{ role }]);
  dbMock.enqueueFor(
    "select",
    "role_grants",
    role === "editor" ? [{ countryCode: "PL", grantRole: "editor", isCountryWide, regionId: isCountryWide ? null : 1 }] : [],
  );
}

export type ReadTarget = "station" | "location" | "cell" | "photo" | "operator";

export function scriptSubmissionReadTargets(kind: ReadTarget, covered: boolean, includesUncoveredStation = false) {
  const target = { countryCode: covered ? "PL" : "DE", regionId: 1 };
  dbMock.enqueueFor("select", "submissions", [{ stationId: kind === "station" ? 1 : null }]);
  dbMock.enqueueFor(
    "select",
    "proposed_stations",
    includesUncoveredStation ? [{ stationId: 2 }] : [],
    kind === "operator" ? [{ type: "new", stationId: null, operatorId: 7 }] : [],
  );
  dbMock.enqueueFor("select", "proposed_locations", kind === "location" ? [{ region_id: 1, latitude: null, longitude: null, current: null }] : []);
  dbMock.enqueueFor("select", "proposed_cells", kind === "cell" ? [{ cellId: 7, stationId: null, sectorId: null }] : []);
  dbMock.enqueueFor("select", "proposed_sectors", []);
  dbMock.enqueueFor("select", "submission_location_photo_selections", kind === "photo" ? [{ locationPhotoId: 8 }] : []);
  if (kind === "station" || kind === "cell")
    dbMock.enqueueFor("select", "stations", includesUncoveredStation ? [target, { countryCode: "DE", regionId: 2 }] : [target]);
  if (kind === "location") dbMock.enqueueFor("select", "regions", [target]);
  if (kind === "cell") dbMock.enqueueFor("select", "cells", [{ stationId: 1 }]);
  if (kind === "photo") {
    dbMock.enqueueFor("select", "location_photos", [{ locationId: 2 }]);
    dbMock.enqueueFor("select", "locations", [target]);
  }
  if (kind === "operator") dbMock.enqueueFor("select", "operators", [{ id: 7, countryCode: target.countryCode }]);
}

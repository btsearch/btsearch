import type { NewCellInput } from "@openbts/shared/contract";
import { getTableName } from "drizzle-orm";

import { DATABASE_RATS } from "../../src/features/stations/serialize.js";
import type { ProposedSectorRow } from "../../src/features/submissions/serialize.js";
import { dbMock } from "./boundaries.js";
import { cellInputs, radioTables, storedCell } from "./cellWriteFixtures.js";
import { readDate, readLocation } from "./readFixtures.js";
import { stationRow } from "./stationFixtures.js";
import { scriptCountryStamp, submissionId, submissionRow, submitterId } from "./submissionFixtures.js";

export const reviewReviewerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type StoredReviewCell = ReturnType<typeof storedCell>;
type ReviewCellSnapshot = StoredReviewCell["cell"] & Pick<StoredReviewCell, "gsm" | "umts" | "lte" | "nr">;

function cellSnapshot(row: StoredReviewCell): ReviewCellSnapshot {
  return { ...row.cell, gsm: row.gsm, umts: row.umts, lte: row.lte, nr: row.nr };
}

function proposedReviewCell(
  input: NewCellInput,
  id = 21,
  operation: "add" | "update" | "delete" = "add",
  targetId: number | null = null,
  targetSectorId: number | null = null,
) {
  const live = storedCell(input, 31 + id - 21, 12);
  const { cell_id: _cellId, ...radio } = live.radio;
  const details = { ...radio, proposed_cell_id: id };
  return {
    id,
    submission_id: submissionId,
    station_id: null,
    operation,
    target_cell_id: targetId,
    band_id: input.bandId,
    rat: DATABASE_RATS[input.rat],
    type: live.cell.type,
    target_sector_id: targetSectorId,
    sector_local_id: "front",
    sector_unassigned: false,
    notes: input.notes ?? null,
    is_confirmed: input.isConfirmed ?? false,
    createdAt: readDate,
    updatedAt: readDate,
    gsm: input.rat === "gsm" ? details : null,
    umts: input.rat === "umts" ? details : null,
    lte: input.rat === "lte" ? details : null,
    nr: input.rat === "nr" ? details : null,
  };
}

export function prepareNewReview(
  inputs: NewCellInput[],
  options: { withLocation?: boolean; submitter?: boolean; withSector?: boolean; duplicate?: { rat: NewCellInput["rat"]; rows: unknown[] } } = {},
) {
  const withLocation = options.withLocation ?? true;
  const withSector = options.withSector ?? true;
  const submission = { ...submissionRow, submitter_id: options.submitter ? submitterId : null };
  const location = { ...readLocation.location, id: 2 };
  const station = stationRow({
    id: 12,
    station_id: "PROPOSED-12",
    operator_id: 7,
    location_id: withLocation ? 2 : null,
    location: withLocation ? location : null,
    status: inputs.length > 0 ? "published" : "pending",
  });
  const proposedStation = {
    id: 1,
    submission_id: submissionId,
    station_id: "PROPOSED-12",
    operator_id: 7,
    notes: null,
    networks_id: null,
    networks_name: null,
    mno_name: null,
    uplink_type: null,
    uplink_speed: null,
    uplink_model: null,
    changed_fields: ["station_id", "operator_id"],
    createdAt: readDate,
    updatedAt: readDate,
  };
  const proposedLocation = withLocation
    ? {
        ...location,
        id: 1,
        submission_id: submissionId,
        move: "station",
        structure_owner_name: null,
        changed_fields: ["region_id", "latitude", "longitude", "city", "address"],
      }
    : undefined;
  const proposedCells = inputs.map((input, index) => ({ ...proposedReviewCell(input, 21 + index), sector_local_id: withSector ? "front" : null }));
  const proposedSectors: ProposedSectorRow[] = withSector
    ? [
        {
          id: 1,
          submission_id: submissionId,
          operation: "add",
          target_sector_id: null,
          local_id: "front",
          azimuth: 90,
          createdAt: readDate,
          updatedAt: readDate,
        },
      ]
    : [];
  const cells = inputs.map((input, index) => storedCell({ ...input, sectorId: withSector ? 5 : null }, 31 + index, 12));
  const approved = { ...submission, status: "approved", station_id: 12, reviewer_id: reviewReviewerId, reviewed_at: readDate };
  dbMock.query.submissions.findFirst.mockResolvedValue(submission);
  dbMock.query.proposedStations.findFirst.mockResolvedValue(proposedStation);
  dbMock.query.proposedLocations.findFirst.mockResolvedValue(proposedLocation);
  dbMock.query.proposedCells.findMany.mockResolvedValue(proposedCells);
  dbMock.query.proposedSectors.findMany.mockResolvedValue(proposedSectors);
  dbMock.query.stations.findFirst.mockResolvedValue(station);
  dbMock.query.cells.findMany.mockResolvedValue(cells.map(cellSnapshot));
  dbMock.query.submissionPhotos.findMany.mockResolvedValue([]);
  dbMock.query.submissionLocationPhotoSelections.findMany.mockResolvedValue([]);
  dbMock.query.users.findFirst.mockResolvedValue({ name: "Reviewer", locale: "en-US" });
  dbMock.query.ukePermits.findMany.mockResolvedValue([]);
  dbMock.query.locations.findFirst.mockResolvedValue(undefined);
  for (const rat of new Set(inputs.map((input) => input.rat)))
    if (rat !== "nr") dbMock.enqueueFor("select", getTableName(radioTables[rat]), options.duplicate?.rat === rat ? options.duplicate.rows : []);
  return {
    submission,
    location,
    station,
    proposedStation,
    proposedLocation,
    proposedCells,
    proposedSectors,
    cells,
    approved,
    inputs,
    withLocation,
    withSector,
  };
}

type PhotoSelection = { station_id: number; location_photo_id: number; is_main: boolean };

export function prepareExistingPhotoReview() {
  const scenario = prepareNewReview([], { submitter: true, withSector: false });
  const submission = { ...scenario.submission, type: "update" as const, station_id: 12 };
  const approved = { ...scenario.approved, type: "update" as const };
  dbMock.query.submissions.findFirst.mockResolvedValue(submission);
  dbMock.query.proposedStations.findFirst.mockResolvedValue(undefined);
  dbMock.query.proposedLocations.findFirst.mockResolvedValue(undefined);
  return { ...scenario, submission, approved, proposedStation: undefined, proposedLocation: undefined };
}

export function writeExistingPhotoReview(
  scenario: ReturnType<typeof prepareExistingPhotoReview>,
  previous: PhotoSelection[],
  next: PhotoSelection[],
  photoCount: number,
  options: {
    siteMnc?: number;
    siblingStationId?: number;
    siblingOld?: PhotoSelection[];
    siblingNew?: PhotoSelection[];
    photoSelectionChecks?: unknown[][];
  } = {},
): void {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "submissions", [scenario.submission]);
  dbMock.enqueueFor("select", "station_photo_selections", previous, ...(options.photoSelectionChecks ?? []));
  if (options.siblingStationId) dbMock.enqueueFor("select", "station_photo_selections", options.siblingOld ?? []);
  dbMock.enqueueFor("select", "station_photo_selections", [...next, ...(options.siblingNew ?? [])]);
  dbMock.enqueueFor("update", "stations", []);
  if (photoCount > 0) dbMock.enqueueFor("select", "stations", [{ locationId: 2, mnc: options.siteMnc ?? null }]);
  if (options.siblingStationId) dbMock.enqueueFor("select", "stations", [{ id: options.siblingStationId }]);
  dbMock.enqueueFor("select", "stations", [{ operatorName: "Operator", operatorMnc: options.siteMnc ?? 7 }], []);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("update", "submissions", [scenario.approved]);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("insert", "notifications", [{ id: "22222222-2222-4222-8222-222222222222" }]);
  dbMock.enqueueFor("select", "station_watches", []);
  dbMock.enqueueFor("select", "user_lists", []);
  serializeReview({ ...scenario, photoCount });
}

export function writeNewReview(
  scenario: ReturnType<typeof prepareNewReview>,
  options: {
    bandRat?: string;
    plannedBandId?: number | null;
    countryCode?: string | null;
    failCellAt?: number;
    beforePhotos?: PhotoSelection[];
    afterPhotos?: PhotoSelection[];
    photoSelectionChecks?: unknown[][];
    lock?: unknown[];
    reviewNote?: string;
    photoCount?: number;
  } = {},
): void {
  const { submission, station, location, cells, inputs, approved, withLocation, withSector } = scenario;
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "submissions", options.lock ?? [submission]);
  if (withLocation) {
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("insert", "locations", [location]);
  }
  dbMock.enqueueFor("insert", "stations", [station]);
  dbMock.enqueueFor(
    "select",
    "station_photo_selections",
    options.beforePhotos ?? [],
    ...(options.photoSelectionChecks ?? []),
    options.afterPhotos ?? [],
  );
  if (withSector) {
    dbMock.enqueueFor("select", "station_sectors", [], [{ id: 5, azimuth: 90 }]);
    dbMock.enqueueFor("insert", "station_sectors", [{ id: 5 }]);
    dbMock.enqueueFor("select", "stations", [{ locationId: withLocation ? 2 : null, mnc: null }]);
  }
  for (const [index, row] of cells.entries()) {
    dbMock.enqueueFor("insert", "cells", options.failCellAt === index ? [] : [row.cell]);
    dbMock.enqueueFor("insert", getTableName(radioTables[inputs[index]!.rat]), [row.radio]);
  }
  dbMock.enqueueFor(
    "select",
    "cells",
    cells.map((row) => ({
      bandId: row.cell.band_id,
      rat: row.cell.rat,
      bandRat: options.bandRat ?? row.cell.rat,
      countryCode: options.countryCode === undefined ? "PL" : options.countryCode,
      plannedBandId: options.plannedBandId === undefined ? row.cell.band_id : options.plannedBandId,
    })),
  );
  const audits = 2 + Number(withLocation) + Number(withSector) + Number(cells.length > 0);
  for (let index = 0; index < audits; index += 1) dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("update", "submissions", [{ ...approved, ...(options.reviewNote === undefined ? {} : { review_notes: options.reviewNote }) }]);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("insert", "uke_import_metadata", [{ id: 1 }]);
  if ((options.photoCount ?? 0) > 0) dbMock.enqueueFor("select", "stations", [{ locationId: withLocation ? 2 : null, mnc: null }]);
  scriptCountryStamp({ stationId: 12, regionId: scenario.proposedLocation?.region_id, operatorId: scenario.proposedStation.operator_id });
  if (submission.submitter_id !== null) {
    dbMock.enqueueFor("select", "stations", [{ operatorName: "Operator", operatorMnc: 7 }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "22222222-2222-4222-8222-222222222222" }]);
  }
  dbMock.enqueueFor("select", "stations", [], []);
  dbMock.enqueueFor("select", "station_watches", [], []);
  dbMock.enqueueFor("select", "user_lists", [], []);
  serializeReview({ ...scenario, photoCount: options.photoCount });
}

type ReviewSerialization = Pick<ReturnType<typeof prepareNewReview>, "proposedCells" | "cells"> & {
  proposedSectors: ProposedSectorRow[];
  proposedLocation?: Omit<NonNullable<ReturnType<typeof prepareNewReview>["proposedLocation"]>, "city" | "address"> & {
    city: string | null;
    address: string | null;
  };
  proposedStation?: Omit<ReturnType<typeof prepareNewReview>["proposedStation"], "notes"> & { notes: string | null };
  photoCount?: number;
};

export function serializeReview(scenario: ReviewSerialization): void {
  dbMock.enqueueFor("select", "proposed_stations", scenario.proposedStation ? [scenario.proposedStation] : []);
  dbMock.enqueueFor("select", "proposed_locations", scenario.proposedLocation ? [scenario.proposedLocation] : []);
  dbMock.enqueueFor("select", "proposed_sectors", scenario.proposedSectors);
  dbMock.enqueueFor(
    "select",
    "proposed_cells",
    scenario.proposedCells.map(({ gsm, umts, lte, nr, ...cell }) => ({ cell, gsm, umts, lte, nr })),
  );
  dbMock.enqueueFor("select", "submission_location_photo_selections", []);
  dbMock.enqueueFor("select", "submission_photos", scenario.photoCount === undefined ? [] : [{ submissionId, total: scenario.photoCount }]);
  dbMock.enqueueFor("select", "users", [], [{ role: "admin" }]);
  dbMock.enqueueFor("select", "role_grants", []);
  if (scenario.cells.length > 0) dbMock.enqueueFor("select", "bands", []);
}

export function prepareUpdatedCellReview(input: NewCellInput, operation: "update" | "delete" = "update") {
  const scenario = prepareNewReview([input], { withLocation: false, withSector: false });
  const submission = { ...scenario.submission, type: "update" as const, station_id: 12 };
  const current = storedCell({ ...cellInputs[input.rat], notes: "Live note", sectorId: 5, isConfirmed: true }, 31, 12);
  const proposed = { ...proposedReviewCell(input, 21, operation, 31), sector_local_id: null, notes: operation === "update" ? "Reviewed note" : null };
  const reviewed = storedCell(input, 31, 12);
  const next = {
    ...current,
    gsm: reviewed.gsm,
    umts: reviewed.umts,
    lte: reviewed.lte,
    nr: reviewed.nr,
    radio: reviewed.radio,
    cell: { ...current.cell, notes: "Reviewed note" },
  };
  const approved = { ...scenario.approved, type: "update" as const };
  dbMock.query.submissions.findFirst.mockResolvedValue(submission);
  dbMock.query.proposedStations.findFirst.mockResolvedValue(undefined);
  dbMock.query.proposedCells.findMany.mockResolvedValue([proposed]);
  dbMock.query.cells.findMany.mockResolvedValueOnce([cellSnapshot(current)]).mockResolvedValue([cellSnapshot(next)]);
  return { ...scenario, submission, approved, current, next, proposed, operation };
}

export function writeUpdatedCellReview(scenario: ReturnType<typeof prepareUpdatedCellReview>): void {
  const input = scenario.inputs[0]!;
  if ((input.rat === "lte" || input.rat === "nr") && input.pci !== null && input.pci !== undefined)
    dbMock.enqueueFor("select", getTableName(radioTables[input.rat]), []);
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "submissions", [scenario.submission]);
  dbMock.enqueueFor("select", "station_photo_selections", [], []);
  if (scenario.operation === "update") {
    dbMock.enqueueFor("update", "cells", []);
    dbMock.enqueueFor("update", getTableName(radioTables[scenario.inputs[0]!.rat]), [scenario.next.radio]);
    dbMock.enqueueFor("select", "cells", [
      {
        bandId: scenario.current.cell.band_id,
        rat: scenario.current.cell.rat,
        bandRat: scenario.current.cell.rat,
        countryCode: "PL",
        plannedBandId: scenario.current.cell.band_id,
      },
    ]);
    dbMock.enqueueFor("update", "stations", []);
  } else {
    dbMock.enqueueFor("delete", "cells", []);
    dbMock.enqueueFor("select", "cells", [{ total: 0 }]);
    dbMock.enqueueFor("update", "stations", [{ ...scenario.station, status: "pending" }]);
    dbMock.enqueueFor("insert", "audit_logs", []);
  }
  dbMock.enqueueFor("insert", "audit_logs", [], []);
  dbMock.enqueueFor("update", "submissions", [scenario.approved]);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("select", "stations", []);
  dbMock.enqueueFor("select", "station_watches", []);
  dbMock.enqueueFor("select", "user_lists", []);
  serializeReview({ ...scenario, proposedStation: undefined, proposedCells: [scenario.proposed] });
}

export function prepareCombinedUpdatedReview() {
  const scenario = prepareNewReview([cellInputs.gsm, cellInputs.lte, cellInputs.nr], { submitter: true });
  const submission = { ...scenario.submission, type: "update" as const, station_id: 12 };
  const location = { ...scenario.location, city: "Reviewed city", address: null };
  const station = { ...scenario.station, station_id: "REVIEWED-12", operator_id: 8, notes: "Reviewed site", location };
  const proposedStation = {
    ...scenario.proposedStation,
    station_id: station.station_id,
    operator_id: 8,
    notes: station.notes,
    changed_fields: ["station_id", "operator_id", "notes"],
  };
  const proposedLocation = { ...scenario.proposedLocation!, city: location.city, address: null, changed_fields: ["city", "address"] };
  const currentGsm = storedCell({ ...cellInputs.gsm, sectorId: 5, notes: "Live note" }, 31, 12);
  const deletedNr = storedCell({ ...cellInputs.nr, sectorId: 6 }, 33, 12);
  const nextGsm = { ...currentGsm, cell: { ...currentGsm.cell, notes: "Reviewed cell" } };
  const addedLte = storedCell({ ...cellInputs.lte, sectorId: 7 }, 32, 12);
  const proposedCells = [
    { ...proposedReviewCell(cellInputs.gsm, 21, "update", 31), target_sector_id: 5, sector_local_id: null, notes: "Reviewed cell" },
    { ...proposedReviewCell(cellInputs.lte, 22), sector_local_id: "rear" },
    { ...proposedReviewCell(cellInputs.nr, 23, "delete", 33), sector_local_id: null },
  ];
  const proposedSectors: ProposedSectorRow[] = [
    { ...scenario.proposedSectors[0]!, operation: "update", target_sector_id: 5, local_id: "front", azimuth: 180 },
    { ...scenario.proposedSectors[0]!, id: 2, local_id: "rear", azimuth: 270 },
    { ...scenario.proposedSectors[0]!, id: 3, operation: "delete", target_sector_id: 6, local_id: "removed", azimuth: 0 },
  ];
  const approved = { ...scenario.approved, type: "update" as const };
  dbMock.query.submissions.findFirst.mockResolvedValue(submission);
  dbMock.query.proposedStations.findFirst.mockResolvedValue(proposedStation);
  dbMock.query.proposedLocations.findFirst.mockResolvedValue(proposedLocation);
  dbMock.query.proposedSectors.findMany.mockResolvedValue(proposedSectors);
  dbMock.query.proposedCells.findMany.mockResolvedValue(proposedCells);
  dbMock.query.cells.findMany
    .mockResolvedValueOnce([currentGsm, deletedNr].map(cellSnapshot))
    .mockResolvedValue([nextGsm, addedLte].map(cellSnapshot));
  return {
    ...scenario,
    submission,
    location,
    station,
    proposedStation,
    proposedLocation,
    proposedCells,
    proposedSectors,
    approved,
    currentGsm,
    deletedNr,
    nextGsm,
    addedLte,
  };
}

export function writeCombinedUpdatedReview(
  scenario: ReturnType<typeof prepareCombinedUpdatedReview>,
  options: {
    duplicateStation?: boolean;
    occupiedDeletedSector?: boolean;
    siblingStationId?: number;
    siblingAssignedCells?: { id: number; sectorId: number | null }[];
  } = {},
): void {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "submissions", [scenario.submission]);
  dbMock.enqueueFor("select", "station_photo_selections", [], []);
  dbMock.enqueueFor("update", "locations", [scenario.location]);
  dbMock.enqueueFor("select", "stations", options.duplicateStation ? [{ id: 99 }] : [], [
    { locationId: 2, mnc: options.siblingStationId ? 26002 : null },
  ]);
  if (options.siblingStationId) dbMock.enqueueFor("select", "stations", [{ id: options.siblingStationId }]);
  dbMock.enqueueFor("select", "stations", [{ operatorName: "New operator", operatorMnc: options.siblingStationId ? 26002 : 8 }], []);
  dbMock.enqueueFor("update", "stations", [scenario.station], []);
  dbMock.enqueueFor(
    "select",
    "station_sectors",
    [
      { id: 5, azimuth: 90 },
      { id: 6, azimuth: 0 },
    ],
    [
      { id: 5, azimuth: 180 },
      { id: 7, azimuth: 270 },
    ],
  );
  dbMock.enqueueFor("update", "station_sectors", []);
  dbMock.enqueueFor("insert", "station_sectors", [{ id: 7 }]);
  dbMock.enqueueFor("update", "cells", []);
  dbMock.enqueueFor("update", getTableName(radioTables.gsm), [scenario.nextGsm.radio]);
  dbMock.enqueueFor("insert", "cells", [scenario.addedLte.cell]);
  dbMock.enqueueFor("insert", getTableName(radioTables.lte), [scenario.addedLte.radio]);
  dbMock.enqueueFor("delete", "cells", []);
  dbMock.enqueueFor("select", "cells", [{ total: 2 }], [{ value: options.occupiedDeletedSector ? 1 : 0 }]);
  if (options.siblingAssignedCells) dbMock.enqueueFor("select", "cells", options.siblingAssignedCells);
  dbMock.enqueueFor(
    "select",
    "cells",
    [scenario.nextGsm, scenario.addedLte].map((row) => ({
      bandId: row.cell.band_id,
      rat: row.cell.rat,
      bandRat: row.cell.rat,
      countryCode: "PL",
      plannedBandId: row.cell.band_id,
    })),
  );
  dbMock.enqueueFor("delete", "station_sectors", []);
  dbMock.enqueueFor("insert", "audit_logs", [], [], [], [], []);
  dbMock.enqueueFor("update", "submissions", [scenario.approved]);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("insert", "notifications", [{ id: "22222222-2222-4222-8222-222222222222" }]);
  dbMock.enqueueFor("select", "station_watches", []);
  dbMock.enqueueFor("select", "user_lists", []);
  serializeReview(scenario);
}

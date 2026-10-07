import {
  ProposedLocationFieldEnum,
  ProposedStationFieldEnum,
  SectorOperationEnum,
  gsmCells,
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedStations,
  proposedUMTSCells,
  submissions,
  umtsCells,
} from "@openbts/drizzle";
import { BSIC_MAX, PSC_MAX } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { type CellIdentityDuplicateDetails, getCellIdentityDuplicateKey } from "../cells/identityDuplicateSpecs.js";
import { type PciDuplicateDetails, getPciDuplicateKey } from "../cells/pciDuplicateSpecs.js";
import { gnbidLengthSchema } from "../cells/ratCellSchemas.js";
import type { StructureChange } from "../locations/structure.js";
import { findPlacementCountryCode } from "../stations/country.js";

export const gsmInsertSchema = createInsertSchema(proposedGSMCells)
  .omit({ proposed_cell_id: true })
  .extend({
    lac: z.number().int().min(0).max(65535),
    cid: z.number().int().min(0).max(65535),
    bsic: z.number().int().min(0).max(BSIC_MAX).nullable().optional(),
  })
  .strict();
export const umtsInsertSchema = createInsertSchema(proposedUMTSCells)
  .omit({ proposed_cell_id: true })
  .extend({
    lac: z.number().int().min(0).max(65535).nullable().optional(),
    rnc: z.number().int().min(0).max(65535),
    cid: z.number().int().min(0).max(65535),
    arfcn: z.number().int().min(0).max(16383).nullable().optional(),
    psc: z.number().int().min(0).max(PSC_MAX).nullable().optional(),
  })
  .strict();
export const lteInsertSchema = createInsertSchema(proposedLTECells)
  .omit({ proposed_cell_id: true })
  .extend({
    tac: z.number().int().min(0).max(65535).nullable().optional(),
    enbid: z.number().int().min(0).max(1048575),
    clid: z.number().int().min(0).max(255),
    pci: z.number().int().min(0).max(503).nullable().optional(),
    earfcn: z.number().int().min(0).max(262143).nullable().optional(),
  })
  .strict();
export const nrInsertSchemaBase = createInsertSchema(proposedNRCells)
  .omit({ proposed_cell_id: true })
  .extend({
    nrtac: z.number().int().min(0).max(16777215).nullable().optional(),
    gnbid: z.number().int().min(0).max(2147483647).nullable().optional(),
    gnbid_length: gnbidLengthSchema.nullable(),
    clid: z.number().int().min(0).max(16383).nullable().optional(),
    pci: z.number().int().min(0).max(1007).nullable().optional(),
    arfcn: z.number().int().min(0).max(3279165).nullable().optional(),
  })
  .strict();

export const gsmSelectSchema = createSelectSchema(proposedGSMCells).omit({ proposed_cell_id: true });
export const umtsSelectSchema = createSelectSchema(proposedUMTSCells).omit({ proposed_cell_id: true });
export const lteSelectSchema = createSelectSchema(proposedLTECells).omit({ proposed_cell_id: true });
export const nrSelectSchema = createSelectSchema(proposedNRCells).omit({ proposed_cell_id: true });

export const proposedCellsSelectSchema = createSelectSchema(proposedCells);
export const proposedStationsSelectSchema = createSelectSchema(proposedStations);
export const proposedLocationsSelectSchema = createSelectSchema(proposedLocations);

export type ProposedStationRow = z.infer<typeof proposedStationsSelectSchema>;
export type ProposedLocationRow = z.infer<typeof proposedLocationsSelectSchema>;

export function makeDetailsRatRefine(schemaMap: Record<string, z.ZodType>) {
  return (data: { rat?: string | null; details?: unknown }, ctx: z.RefinementCtx) => {
    if (!data.details || !data.rat) return;
    const schema = schemaMap[data.rat];
    if (!schema) return;
    const result = schema.safeParse(data.details);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["details", ...issue.path] });
  };
}

export type ProposedStationField = (typeof ProposedStationFieldEnum.enumValues)[number];
export type ProposedLocationField = (typeof ProposedLocationFieldEnum.enumValues)[number];
export type ProposedStationChanges = Partial<Pick<ProposedStationRow, ProposedStationField>>;
export type ProposedLocationChanges = Partial<Pick<ProposedLocationRow, ProposedLocationField | "structure_owner_name">>;
export type ProposedStructureChange = StructureChange & Pick<ProposedLocationChanges, "structure_owner_name">;

type CurrentStationForDiff = { station_id: string | null; operator_id: number | null; notes: string | null };
type CurrentExtraIdentifierForDiff = { networks_id: number | null; networks_name: string | null; mno_name: string | null } | null;
type CurrentUplinkForDiff = { type: string; speed: number | null; model: string | null } | null;
type CurrentLocationForDiff = StructureChange & {
  region_id: number;
  city: string | null;
  address: string | null;
  longitude: number;
  latitude: number;
};

export function normalizeText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function pickFields<T, K extends keyof T>(source: T, fields: readonly K[]): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {};
  for (const field of fields) Object.assign(picked, { [field]: source[field] });
  return picked;
}

function listChangedFields<F extends string>(changes: Partial<Record<F, unknown>>, fields: readonly F[]): F[] {
  return fields.filter((field) => changes[field] !== undefined);
}

export function changedStationFields(changes: ProposedStationChanges): ProposedStationField[] {
  return listChangedFields(changes, ProposedStationFieldEnum.enumValues);
}

export function changedLocationFields(changes: ProposedLocationChanges): ProposedLocationField[] {
  return listChangedFields<ProposedLocationField>(changes, ProposedLocationFieldEnum.enumValues);
}

export function isCompleteLocation(location: ProposedLocationChanges): boolean {
  return typeof location.region_id === "number" && typeof location.longitude === "number" && typeof location.latitude === "number";
}

export function getProposedStationChanges(row: ProposedStationRow): ProposedStationChanges {
  return pickFields(row, row.changed_fields ?? ProposedStationFieldEnum.enumValues.filter((field) => row[field] !== null));
}

export function getProposedLocationChanges(row: ProposedLocationRow): ProposedLocationChanges {
  const fields = row.changed_fields ?? ProposedLocationFieldEnum.enumValues.filter((field) => row[field] !== null);
  const changes: ProposedLocationChanges = pickFields(row, fields);
  if (!row.structure_owner_name) return changes;

  return { ...changes, structure_owner_id: null, structure_owner_name: row.structure_owner_name };
}

export function diffProposedStation(
  stationData: ProposedStationChanges,
  currentStation: CurrentStationForDiff,
  currentExtraIdentifier: CurrentExtraIdentifierForDiff,
  currentUplink: CurrentUplinkForDiff,
): ProposedStationChanges {
  const changes: ProposedStationChanges = {};
  if (stationData.station_id !== undefined && stationData.station_id !== null && stationData.station_id !== currentStation.station_id)
    changes.station_id = stationData.station_id;
  if (stationData.operator_id !== undefined && stationData.operator_id !== null && stationData.operator_id !== currentStation.operator_id)
    changes.operator_id = stationData.operator_id;
  const proposedNotes = normalizeText(stationData.notes);
  if (stationData.notes !== undefined && proposedNotes !== normalizeText(currentStation.notes)) changes.notes = proposedNotes;
  if (stationData.networks_id !== undefined && stationData.networks_id !== (currentExtraIdentifier?.networks_id ?? null))
    changes.networks_id = stationData.networks_id;
  if (stationData.networks_name !== undefined && normalizeText(stationData.networks_name) !== normalizeText(currentExtraIdentifier?.networks_name))
    changes.networks_name = normalizeText(stationData.networks_name);
  if (stationData.mno_name !== undefined && normalizeText(stationData.mno_name) !== normalizeText(currentExtraIdentifier?.mno_name))
    changes.mno_name = normalizeText(stationData.mno_name);
  if (stationData.uplink_type !== undefined && stationData.uplink_type !== (currentUplink?.type ?? null))
    changes.uplink_type = stationData.uplink_type;
  if (stationData.uplink_speed !== undefined && stationData.uplink_speed !== (currentUplink?.speed ?? null))
    changes.uplink_speed = stationData.uplink_speed;
  if (stationData.uplink_model !== undefined && normalizeText(stationData.uplink_model) !== normalizeText(currentUplink?.model))
    changes.uplink_model = normalizeText(stationData.uplink_model);
  return changes;
}

export function diffProposedLocation(locationData: ProposedLocationChanges, currentLocation: CurrentLocationForDiff | null): ProposedLocationChanges {
  const changes: ProposedLocationChanges = {};
  const latitude = locationData.latitude ?? currentLocation?.latitude ?? null;
  const longitude = locationData.longitude ?? currentLocation?.longitude ?? null;
  const changesCoordinates = latitude !== (currentLocation?.latitude ?? null) || longitude !== (currentLocation?.longitude ?? null);
  if (changesCoordinates) {
    changes.latitude = latitude;
    changes.longitude = longitude;
  }
  if (locationData.region_id !== undefined && locationData.region_id !== null && locationData.region_id !== currentLocation?.region_id)
    changes.region_id = locationData.region_id;
  if (locationData.city !== undefined && normalizeText(locationData.city) !== normalizeText(currentLocation?.city))
    changes.city = normalizeText(locationData.city);
  if (locationData.address !== undefined && normalizeText(locationData.address) !== normalizeText(currentLocation?.address))
    changes.address = normalizeText(locationData.address);

  const { structure_type: type, structure_owner_id: ownerId, structure_owner_name: ownerName } = locationData;
  const note = locationData.structure_note === undefined ? undefined : normalizeText(locationData.structure_note);
  if (type !== undefined && (changesCoordinates || type !== (currentLocation?.structure_type ?? null))) changes.structure_type = type;
  if (ownerName) {
    changes.structure_owner_id = null;
    changes.structure_owner_name = ownerName;
  } else if (ownerId !== undefined && (changesCoordinates || ownerId !== (currentLocation?.structure_owner_id ?? null))) {
    changes.structure_owner_id = ownerId;
  }
  if (note !== undefined && (changesCoordinates || note !== normalizeText(currentLocation?.structure_note))) changes.structure_note = note;
  return changes;
}

export function stationUpdateDiffers(
  stationData: ProposedStationChanges,
  currentStation: CurrentStationForDiff,
  currentExtraIdentifier: CurrentExtraIdentifierForDiff,
  currentUplink: CurrentUplinkForDiff,
): boolean {
  return changedStationFields(diffProposedStation(stationData, currentStation, currentExtraIdentifier, currentUplink)).length > 0;
}

export function locationUpdateDiffers(locationData: ProposedLocationChanges, currentLocation: CurrentLocationForDiff | null): boolean {
  return changedLocationFields(diffProposedLocation(locationData, currentLocation)).length > 0;
}

export async function stripUnchangedProposalData(
  tx: DbTx,
  targetStationId: number,
  stationData: ProposedStationChanges | undefined,
  locationData: ProposedLocationChanges | undefined,
): Promise<{ stationData: ProposedStationChanges | undefined; locationData: ProposedLocationChanges | undefined }> {
  if (!stationData && !locationData) return { stationData, locationData };

  const [targetStation, targetExtraIdentifier, targetUplink] = await Promise.all([
    tx.query.stations.findFirst({ where: { id: targetStationId }, with: { location: true } }),
    tx.query.extraIdentificators.findFirst({ where: { station_id: targetStationId } }),
    tx.query.stationUplinks.findFirst({ where: { station_id: targetStationId } }),
  ]);
  if (!targetStation) return { stationData, locationData };

  const stationChanges = stationData && diffProposedStation(stationData, targetStation, targetExtraIdentifier ?? null, targetUplink ?? null);
  const locationChanges = locationData && diffProposedLocation(locationData, targetStation.location);

  return {
    stationData: stationChanges && changedStationFields(stationChanges).length > 0 ? stationChanges : undefined,
    locationData: locationChanges && changedLocationFields(locationChanges).length > 0 ? locationChanges : undefined,
  };
}

export async function stampSubmissionCountry(tx: DbTx, submissionId: string): Promise<string | null> {
  const [placement] = await tx
    .select({ stationId: submissions.station_id, regionId: proposedLocations.region_id, operatorId: proposedStations.operator_id })
    .from(submissions)
    .leftJoin(proposedLocations, eq(proposedLocations.submission_id, submissions.id))
    .leftJoin(proposedStations, eq(proposedStations.submission_id, submissions.id))
    .where(eq(submissions.id, submissionId))
    .limit(1);
  if (!placement) return null;

  const countryCode = await findPlacementCountryCode(placement, tx);
  await tx.update(submissions).set({ country_code: countryCode }).where(eq(submissions.id, submissionId));
  return countryCode;
}

const MAX_SECTORS = 15;

export type SectorOperation = (typeof SectorOperationEnum.enumValues)[number];
export type CurrentSector = { id: number; azimuth: number };
export type ProposedSectorChange = { operation: SectorOperation; target_sector_id: number | null; local_id: string; azimuth: number };
type ProposedSectorInput = { operation?: SectorOperation | null; target_sector_id?: number | null; local_id: string; azimuth: number };
type ProposedCellSectorInput = { target_sector_id?: number | null; sector_local_id?: string | null };
type ResolvedSectorChanges = { changes: ProposedSectorChange[]; unchangedSectorIdByLocalId: Map<string, number> };

function isLegacySectorList(sectors: readonly ProposedSectorInput[]): boolean {
  return sectors.some((sector) => !sector.operation);
}

function legacySectorListToChanges(sectors: readonly ProposedSectorInput[], currentSectors: readonly CurrentSector[]): ResolvedSectorChanges {
  const currentById = new Map(currentSectors.map((sector) => [sector.id, sector]));
  const retainedIds = new Set<number>();
  const changes: ProposedSectorChange[] = [];
  const unchangedSectorIdByLocalId = new Map<string, number>();

  for (const sector of sectors) {
    const targetId = sector.target_sector_id ?? null;
    const match =
      targetId !== null
        ? currentById.get(targetId)
        : currentSectors.find((current) => current.azimuth === sector.azimuth && !retainedIds.has(current.id));
    if (match === undefined) {
      changes.push({ operation: "add", target_sector_id: null, local_id: sector.local_id, azimuth: sector.azimuth });
      continue;
    }
    retainedIds.add(match.id);
    if (match.azimuth === sector.azimuth) unchangedSectorIdByLocalId.set(sector.local_id, match.id);
    else changes.push({ operation: "update", target_sector_id: match.id, local_id: sector.local_id, azimuth: sector.azimuth });
  }

  const localIds = new Set(sectors.map((sector) => sector.local_id));
  for (const current of currentSectors) {
    if (retainedIds.has(current.id)) continue;
    const localId = localIds.has(`sector-${current.id}`) ? `sector-${current.id}-removed` : `sector-${current.id}`;
    changes.push({ operation: "delete", target_sector_id: current.id, local_id: localId, azimuth: current.azimuth });
  }

  return { changes, unchangedSectorIdByLocalId };
}

export function resolveSectorChanges(sectors: readonly ProposedSectorInput[], currentSectors: readonly CurrentSector[]): ResolvedSectorChanges {
  if (isLegacySectorList(sectors)) return legacySectorListToChanges(sectors, currentSectors);
  return {
    changes: sectors.flatMap(({ operation, target_sector_id, local_id, azimuth }) =>
      operation ? [{ operation, target_sector_id: target_sector_id ?? null, local_id, azimuth }] : [],
    ),
    unchangedSectorIdByLocalId: new Map(),
  };
}

export function validateSectorChanges(
  sectors: readonly ProposedSectorInput[] | undefined,
  currentSectors: readonly CurrentSector[],
  cells: readonly ProposedCellSectorInput[] = [],
): ProposedSectorChange[] {
  const input = sectors ?? [];
  const currentIds = new Set(currentSectors.map((sector) => sector.id));
  const localIds = new Set<string>();
  for (const sector of input) {
    if (localIds.has(sector.local_id)) throw new ErrorResponse("BAD_REQUEST", { message: "A sector can be listed only once" });
    localIds.add(sector.local_id);
    if (typeof sector.target_sector_id === "number" && !currentIds.has(sector.target_sector_id))
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more sectors do not belong to this station" });
  }
  if (isLegacySectorList(input) && input.some((sector) => sector.operation))
    throw new ErrorResponse("BAD_REQUEST", { message: "Every sector change must say whether it adds, updates or deletes" });

  const { changes } = resolveSectorChanges(input, currentSectors);
  const azimuthById = new Map(currentSectors.map((sector) => [sector.id, sector.azimuth]));
  const addedAzimuths: number[] = [];
  const changedIds = new Set<number>();
  for (const change of changes) {
    if (change.operation === "add") {
      if (change.target_sector_id !== null) throw new ErrorResponse("BAD_REQUEST", { message: "A new sector cannot point at an existing sector" });
      addedAzimuths.push(change.azimuth);
      continue;
    }
    if (change.target_sector_id === null)
      throw new ErrorResponse("BAD_REQUEST", { message: "An updated or deleted sector must be an existing sector" });
    if (changedIds.has(change.target_sector_id)) throw new ErrorResponse("BAD_REQUEST", { message: "Each sector can only be changed once" });
    changedIds.add(change.target_sector_id);
    if (change.operation === "delete") azimuthById.delete(change.target_sector_id);
    else azimuthById.set(change.target_sector_id, change.azimuth);
  }

  const finalAzimuths = [...azimuthById.values(), ...addedAzimuths];
  if (new Set(finalAzimuths).size !== finalAzimuths.length) throw new ErrorResponse("BAD_REQUEST", { message: "Azimuth values must be unique" });
  if (finalAzimuths.length > MAX_SECTORS) throw new ErrorResponse("BAD_REQUEST", { message: `A station can have at most ${MAX_SECTORS} sectors` });

  for (const cell of cells) {
    if (typeof cell.target_sector_id === "number" && !currentIds.has(cell.target_sector_id))
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more cells are assigned to a sector that does not belong to this station" });
    if (cell.sector_local_id && !localIds.has(cell.sector_local_id))
      throw new ErrorResponse("BAD_REQUEST", { message: "One or more cells are assigned to a new sector that is missing from this change" });
  }

  return changes;
}

export function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(isNonEmpty);
  if (typeof value === "object") return Object.values(value as object).some(isNonEmpty);
  return false;
}

interface CellWithDetails {
  rat?: string | null;
  operation?: string | null;
  band_id?: number | null;
  details?: unknown;
}

export function validateCellDuplicates(cells: CellWithDetails[]): void {
  const seenIdentityKeysByRat = new Map<string, Set<string>>();
  for (const cell of cells) {
    if (cell.operation === "delete") continue;
    const duplicateKey = getCellIdentityDuplicateKey({
      rat: cell.rat,
      details: cell.details as CellIdentityDuplicateDetails | undefined,
    });
    if (!duplicateKey) continue;

    const seen = seenIdentityKeysByRat.get(duplicateKey.rat) ?? new Set<string>();
    if (seen.has(duplicateKey.key)) throw new ErrorResponse("BAD_REQUEST", { message: duplicateKey.message });
    seen.add(duplicateKey.key);
    seenIdentityKeysByRat.set(duplicateKey.rat, seen);
  }

  const seenPciKeysByRat = new Map<string, Set<string>>();
  for (const cell of cells) {
    if (cell.operation === "delete") continue;
    const duplicateKey = getPciDuplicateKey({
      rat: cell.rat,
      bandId: cell.band_id,
      details: cell.details as PciDuplicateDetails | undefined,
    });
    if (!duplicateKey) continue;

    const seen = seenPciKeysByRat.get(duplicateKey.rat) ?? new Set<string>();
    if (seen.has(duplicateKey.key))
      throw new ErrorResponse("BAD_REQUEST", { message: `Duplicate PCI ${duplicateKey.pci} found on the same band in ${duplicateKey.rat} cells` });
    seen.add(duplicateKey.key);
    seenPciKeysByRat.set(duplicateKey.rat, seen);
  }
}

async function resolveProposedCode(
  tx: DbTx,
  rat: "GSM" | "UMTS",
  sent: number | null | undefined,
  targetCellId: number | null,
): Promise<number | null | undefined> {
  if (sent !== undefined || targetCellId === null) return sent;

  const [live] =
    rat === "GSM"
      ? await tx.select({ code: gsmCells.bsic }).from(gsmCells).where(eq(gsmCells.cell_id, targetCellId))
      : await tx.select({ code: umtsCells.psc }).from(umtsCells).where(eq(umtsCells.cell_id, targetCellId));
  return live?.code;
}

export async function insertProposedCellDetails(
  tx: DbTx,
  rat: string | null | undefined,
  details: Record<string, unknown> | null | undefined,
  proposedCellId: number,
  targetCellId: number | null = null,
): Promise<void> {
  if (!details) return;
  switch (rat) {
    case "GSM": {
      const gsm = details as z.infer<typeof gsmInsertSchema>;
      const bsic = await resolveProposedCode(tx, "GSM", gsm.bsic, targetCellId);
      await tx.insert(proposedGSMCells).values({ ...gsm, bsic, proposed_cell_id: proposedCellId });
      break;
    }
    case "UMTS": {
      const umts = details as z.infer<typeof umtsInsertSchema>;
      const psc = await resolveProposedCode(tx, "UMTS", umts.psc, targetCellId);
      await tx.insert(proposedUMTSCells).values({ ...umts, psc, proposed_cell_id: proposedCellId });
      break;
    }
    case "LTE":
      await tx.insert(proposedLTECells).values({ ...(details as z.infer<typeof lteInsertSchema>), proposed_cell_id: proposedCellId });
      break;
    case "NR": {
      const nrDetails = details as z.infer<typeof nrInsertSchemaBase>;
      await tx.insert(proposedNRCells).values({ ...nrDetails, proposed_cell_id: proposedCellId });
      break;
    }
  }
}

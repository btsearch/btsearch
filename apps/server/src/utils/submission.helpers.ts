import { proposedCells, proposedGSMCells, proposedLTECells, proposedNRCells, proposedUMTSCells } from "@openbts/drizzle";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import { ErrorResponse } from "../errors.js";
import type { DbTx } from "../types/global.js";
import { type CellIdentityDuplicateDetails, getCellIdentityDuplicateKey } from "./cellIdentityDuplicateSpecs.js";
import { type PciDuplicateDetails, getPciDuplicateKey } from "./pciDuplicateSpecs.js";

export const gsmInsertSchema = createInsertSchema(proposedGSMCells)
  .omit({ proposed_cell_id: true })
  .extend({ lac: z.number().int().min(0).max(65535), cid: z.number().int().min(0).max(65535) })
  .strict();
export const umtsInsertSchema = createInsertSchema(proposedUMTSCells)
  .omit({ proposed_cell_id: true })
  .extend({
    lac: z.number().int().min(0).max(65535).nullable().optional(),
    rnc: z.number().int().min(0).max(65535),
    cid: z.number().int().min(0).max(65535),
    arfcn: z.number().int().min(0).max(16383).nullable().optional(),
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
    gnbid: z.number().int().min(0).max(4294967295).nullable().optional(),
    clid: z.number().int().min(0).max(16383).nullable().optional(),
    pci: z.number().int().min(0).max(1007).nullable().optional(),
    arfcn: z.number().int().min(0).max(3279165).nullable().optional(),
  })
  .strict();

export const gsmSelectSchema = createSelectSchema(proposedGSMCells).omit({ proposed_cell_id: true });
export const umtsSelectSchema = createSelectSchema(proposedUMTSCells).omit({ proposed_cell_id: true });
export const lteSelectSchema = createSelectSchema(proposedLTECells).omit({ proposed_cell_id: true });
export const nrSelectSchema = createSelectSchema(proposedNRCells).omit({ proposed_cell_id: true });
export const detailsSelectSchema = z.union([gsmSelectSchema, umtsSelectSchema, lteSelectSchema, nrSelectSchema]).nullable();

export const proposedCellsSelectSchema = createSelectSchema(proposedCells);

export function makeDetailsRatRefine(schemaMap: Record<string, z.ZodType>) {
  return (data: { rat?: string | null; details?: unknown }, ctx: z.RefinementCtx) => {
    if (!data.details || !data.rat) return;
    const schema = schemaMap[data.rat];
    if (!schema) return;
    const result = schema.safeParse(data.details);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["details", ...issue.path] });
  };
}

export function computeGnbidLength(gnbid: number | null | undefined): number | undefined {
  if (gnbid === null || gnbid === undefined) return undefined;
  return Number(gnbid).toString(2).length;
}

type ProposedStationDiffInput = {
  station_id?: string | null;
  operator_id?: number | null;
  notes?: string | null;
  networks_id?: number | null;
  networks_name?: string | null;
  mno_name?: string | null;
};
type CurrentStationForDiff = { station_id: string | null; operator_id: number | null; notes: string | null };
type CurrentExtraIdentifierForDiff = { networks_id: number | null; networks_name: string | null; mno_name: string | null } | null;

export function normalizeText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function stationUpdateDiffers(
  stationData: ProposedStationDiffInput,
  currentStation: CurrentStationForDiff,
  currentExtraIdentifier: CurrentExtraIdentifierForDiff,
): boolean {
  if (stationData.station_id !== undefined && stationData.station_id !== null && stationData.station_id !== currentStation.station_id) return true;
  if (stationData.operator_id !== undefined && stationData.operator_id !== currentStation.operator_id) return true;
  const proposedNotes = normalizeText(stationData.notes);
  if (proposedNotes !== null && proposedNotes !== normalizeText(currentStation.notes)) return true;
  if (stationData.networks_id !== undefined && (stationData.networks_id ?? null) !== (currentExtraIdentifier?.networks_id ?? null)) return true;
  if (stationData.networks_name !== undefined && normalizeText(stationData.networks_name) !== normalizeText(currentExtraIdentifier?.networks_name))
    return true;
  if (stationData.mno_name !== undefined && normalizeText(stationData.mno_name) !== normalizeText(currentExtraIdentifier?.mno_name)) return true;
  return false;
}

type ProposedLocationDiffInput = {
  region_id?: number | null;
  city?: string | null;
  address?: string | null;
  longitude?: number | null;
  latitude?: number | null;
};
type CurrentLocationForDiff = { region_id: number; city: string | null; address: string | null; longitude: number; latitude: number };

export function locationUpdateDiffers(locationData: ProposedLocationDiffInput, currentLocation: CurrentLocationForDiff): boolean {
  if (locationData.latitude !== undefined && locationData.latitude !== currentLocation.latitude) return true;
  if (locationData.longitude !== undefined && locationData.longitude !== currentLocation.longitude) return true;
  if (locationData.region_id !== undefined && locationData.region_id !== currentLocation.region_id) return true;
  if (locationData.city !== undefined && normalizeText(locationData.city) !== normalizeText(currentLocation.city)) return true;
  if (locationData.address !== undefined && normalizeText(locationData.address) !== normalizeText(currentLocation.address)) return true;
  return false;
}

export async function stripUnchangedProposalData<S extends ProposedStationDiffInput, L extends ProposedLocationDiffInput>(
  tx: DbTx,
  targetStationId: number,
  stationData: S | undefined,
  locationData: L | undefined,
): Promise<{ stationData: S | undefined; locationData: L | undefined }> {
  if (!stationData && !locationData) return { stationData, locationData };

  const [targetStation, targetExtraIdentifier] = await Promise.all([
    tx.query.stations.findFirst({ where: { id: targetStationId }, with: { location: true } }),
    tx.query.extraIdentificators.findFirst({ where: { station_id: targetStationId } }),
  ]);
  if (!targetStation) return { stationData, locationData };

  let resolvedStation: S | undefined = stationData;
  if (stationData) {
    if (stationUpdateDiffers(stationData, targetStation, targetExtraIdentifier ?? null)) {
      const proposedNotes = normalizeText(stationData.notes);
      resolvedStation = {
        ...stationData,
        station_id:
          stationData.station_id !== undefined && stationData.station_id !== null && stationData.station_id !== targetStation.station_id
            ? stationData.station_id
            : null,
        notes: proposedNotes !== null && proposedNotes !== normalizeText(targetStation.notes) ? proposedNotes : null,
      };
    } else resolvedStation = undefined;
  }

  let resolvedLocation: L | undefined = locationData;
  if (locationData && targetStation.location && !locationUpdateDiffers(locationData, targetStation.location)) resolvedLocation = undefined;

  return { stationData: resolvedStation, locationData: resolvedLocation };
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

export async function insertProposedCellDetails(
  tx: { insert: (table: any) => any },
  rat: string | null | undefined,
  details: Record<string, unknown> | null | undefined,
  proposedCellId: number,
): Promise<void> {
  if (!details) return;
  switch (rat) {
    case "GSM":
      await tx.insert(proposedGSMCells).values({ ...(details as z.infer<typeof gsmInsertSchema>), proposed_cell_id: proposedCellId });
      break;
    case "UMTS":
      await tx.insert(proposedUMTSCells).values({ ...(details as z.infer<typeof umtsInsertSchema>), proposed_cell_id: proposedCellId });
      break;
    case "LTE":
      await tx.insert(proposedLTECells).values({ ...(details as z.infer<typeof lteInsertSchema>), proposed_cell_id: proposedCellId });
      break;
    case "NR": {
      const nrDetails = details as z.infer<typeof nrInsertSchemaBase>;
      await tx.insert(proposedNRCells).values({
        ...nrDetails,
        proposed_cell_id: proposedCellId,
        gnbid_length: computeGnbidLength(nrDetails.gnbid),
      });
      break;
    }
  }
}

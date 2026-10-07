import { cells, extraIdentificators, gsmCells, lteCells, nrCells, stationSectors, stationUplinks, stations, umtsCells } from "@openbts/drizzle";
import type {
  Backhaul,
  Cell,
  CellRat,
  CountryFeatures,
  Sector,
  Station,
  StationIdentifier,
  StationLocation,
  StationStatus,
} from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import { type BandRow, toBand } from "../bands/serialize.js";
import { isUnknownBand } from "../bands/unknown.js";
import { toStructure } from "../locations/structure.js";
import type { LocationRow } from "../locations/write.js";
import type { StructureOwnerRow } from "../structures/serialize.js";

const stationSelectSchema = createSelectSchema(stations);
const identifierSelectSchema = createSelectSchema(extraIdentificators);
const cellSelectSchema = createSelectSchema(cells);
const gsmCellSelectSchema = createSelectSchema(gsmCells);
const umtsCellSelectSchema = createSelectSchema(umtsCells);
const lteCellSelectSchema = createSelectSchema(lteCells);
const nrCellSelectSchema = createSelectSchema(nrCells);
const sectorSelectSchema = createSelectSchema(stationSectors);
const uplinkSelectSchema = createSelectSchema(stationUplinks);

export type StationRow = z.infer<typeof stationSelectSchema>;
type IdentifierRow = z.infer<typeof identifierSelectSchema>;
export type CellRow = z.infer<typeof cellSelectSchema>;

export type CellRows = {
  cell: CellRow;
  gsm: z.infer<typeof gsmCellSelectSchema> | null;
  umts: z.infer<typeof umtsCellSelectSchema> | null;
  lte: z.infer<typeof lteCellSelectSchema> | null;
  nr: z.infer<typeof nrCellSelectSchema> | null;
};

type LegacyRatRows = {
  [Rat in CellRat]: Omit<NonNullable<CellRows[Rat]>, "cell_id"> | null | undefined;
};

const STATUSES = { published: "active", pending: "awaitingCells", inactive: "inactive" } as const;
const OMNIDIRECTIONAL_AZIMUTH = 360;

export const CELL_TYPES = { MACROCELL: "macro", MICROCELL: "micro", PICOCELL: "pico", FEMTOCELL: "femto" } as const;
export const DATABASE_RATS = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" } as const satisfies Record<CellRat, string>;
export const CONTRACT_RATS: Partial<Record<CellRow["rat"], CellRat>> = { GSM: "gsm", UMTS: "umts", LTE: "lte", NR: "nr" };
export const DATABASE_STATUSES: Record<StationStatus, StationRow["status"]> = { active: "published", awaitingCells: "pending", inactive: "inactive" };

export function toStationStatus(status: StationRow["status"]): StationStatus {
  return STATUSES[status];
}

export function toAzimuth(azimuth: number): number | null {
  return azimuth === OMNIDIRECTIONAL_AZIMUTH ? null : azimuth;
}

export function toSector(row: z.infer<typeof sectorSelectSchema>): Sector {
  return { id: row.id, azimuth: toAzimuth(row.azimuth) };
}

export function toBackhaul(row: z.infer<typeof uplinkSelectSchema>): Backhaul {
  return { medium: row.type, speedMbps: row.speed, model: row.model, updatedAt: row.updatedAt.toISOString() };
}

function toIdentifiers(rows: readonly IdentifierRow[]): StationIdentifier[] {
  const identifiers: StationIdentifier[] = [];
  for (const row of rows) {
    if (row.networks_id !== null) identifiers.push({ kind: "networksId", value: String(row.networks_id) });
    if (row.networks_name !== null) identifiers.push({ kind: "networksName", value: row.networks_name });
    if (row.mno_name !== null) identifiers.push({ kind: "operatorName", value: row.mno_name });
  }
  return identifiers;
}

export function toStationLocation(row: Omit<LocationRow, "point">, countryCode: string, owner: StructureOwnerRow | null): StationLocation {
  return {
    id: row.id,
    countryCode,
    regionId: row.region_id,
    city: row.city,
    address: row.address,
    structure: toStructure(row, owner),
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toLegacyCellDetails(
  { gsm, umts, lte, nr }: LegacyRatRows,
  features: Readonly<CountryFeatures>,
): NonNullable<LegacyRatRows[CellRat]> | null {
  if (gsm) return { ...gsm, bsic: features.bsic ? gsm.bsic : null };
  if (umts) return { ...umts, psc: features.psc ? umts.psc : null };
  return lte ?? nr ?? null;
}

export function toCell(
  { cell, gsm, umts, lte, nr }: CellRows,
  band: BandRow | undefined,
  embedBand: boolean,
  features: Readonly<CountryFeatures>,
): Cell | null {
  const common = {
    id: cell.id,
    stationId: cell.station_id,
    bandId: band && isUnknownBand(band) ? null : cell.band_id,
    sectorId: cell.sector_id,
    cellType: cell.type === null ? null : CELL_TYPES[cell.type],
    isConfirmed: cell.is_confirmed,
    notes: cell.notes,
    createdAt: cell.createdAt.toISOString(),
    updatedAt: cell.updatedAt.toISOString(),
  };
  const base = embedBand && band && !isUnknownBand(band) ? { ...common, band: toBand(band) } : common;

  if (cell.rat === "GSM" && gsm) {
    const bsic = features.bsic ? gsm.bsic : null;
    return { ...base, rat: "gsm", lac: gsm.lac, cid: gsm.cid, isEGsm: gsm.e_gsm ?? false, bsic };
  }

  if (cell.rat === "UMTS" && umts) {
    const rnc = umts.rnc === 0 ? null : umts.rnc;
    return {
      ...base,
      rat: "umts",
      lac: umts.lac,
      rnc,
      cid: rnc === null && umts.cid === 0 ? null : umts.cid,
      longCid: rnc === null ? null : umts.cid_long,
      psc: features.psc ? umts.psc : null,
      uarfcn: umts.arfcn,
    };
  }

  if (cell.rat === "LTE" && lte) {
    const enbid = lte.enbid === 0 ? null : lte.enbid;
    return {
      ...base,
      rat: "lte",
      tac: lte.tac,
      enbid,
      clid: enbid === null && lte.clid === 0 ? null : lte.clid,
      eci: enbid === null ? null : lte.ecid,
      pci: lte.pci,
      earfcn: lte.earfcn,
      supportsIot: lte.supports_iot ?? false,
    };
  }

  if (cell.rat === "NR" && nr) {
    const gnbid = nr.gnbid === 0 ? null : nr.gnbid;
    return {
      ...base,
      rat: "nr",
      mode: nr.type,
      tac: nr.nrtac,
      gnbid,
      gnbidLength: nr.gnbid_length,
      clid: nr.clid,
      nci: gnbid === null || nr.nci === null ? null : Number(nr.nci),
      pci: nr.pci,
      arfcn: nr.arfcn,
      supportsRedCap: nr.supports_nr_redcap ?? false,
    };
  }

  return null;
}

export function toStation(row: StationRow, identifiers: readonly IdentifierRow[], hostStationId: number | null): Station {
  return {
    id: row.id,
    siteId: row.station_id,
    operatorId: row.operator_id,
    locationId: row.location_id,
    hostStationId,
    status: toStationStatus(row.status),
    isConfirmed: row.is_confirmed ?? false,
    notes: row.notes,
    identifiers: toIdentifiers(identifiers),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    statusChangedAt: row.statusChangedAt.toISOString(),
  };
}

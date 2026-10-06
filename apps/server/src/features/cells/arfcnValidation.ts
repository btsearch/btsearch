import { bands, cells, countryBands, locations, operators, regions, stations } from "@openbts/drizzle";
import { isChannelValidForBand } from "@openbts/shared/bandCatalog";
import { and, eq, inArray, or } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { stationCountryCode } from "../stations/country.js";

type CellARFCNDetails = {
  arfcn?: number | null;
  earfcn?: number | null;
};

type CellARFCNCandidate = {
  rat?: string | null;
  band_id?: number | null;
  details?: unknown;
};

type CellARFCNBand = {
  id: number;
  rat: string;
  value: number | null;
  duplex: string | null;
  variant?: string | null;
  code?: string | null;
};

type BandPlan = { countryCode: string; bandIds: ReadonlySet<number> };
export type StoredCellScope = { cellIds: readonly number[]; stationId: number | null };

const RAT_ARFCN_FIELDS: Partial<Record<string, keyof CellARFCNDetails>> = {
  LTE: "earfcn",
  NR: "arfcn",
  UMTS: "arfcn",
};

const RAT_ARFCN_LABELS: Partial<Record<string, string>> = {
  LTE: "EARFCN",
  UMTS: "UARFCN",
};

export function formatARFCNBandErrorMessage(rat: string, bandValue: number, arfcn: number): string {
  const label = RAT_ARFCN_LABELS[rat] ?? "ARFCN";
  return `${label} ${arfcn} is not valid for \`${rat}${bandValue}\``;
}

function wrongTechnology(bandId: number, bandRat: string, cellRat: string): ErrorResponse {
  return new ErrorResponse("BAD_REQUEST", { message: `Band ${bandId} is for ${bandRat} cells, not ${cellRat}` });
}

function unplannedBand(bandId: number, countryCode: string): ErrorResponse {
  return new ErrorResponse("BAD_REQUEST", { message: `Band ${bandId} is not in the band plan of ${countryCode}` });
}

export function getCellARFCNForRat(rat: string, details: unknown): number | null | undefined {
  const channelField = RAT_ARFCN_FIELDS[rat];
  if (!channelField) return undefined;
  return (details as CellARFCNDetails | null | undefined)?.[channelField];
}

export function validateCellBands(candidates: CellARFCNCandidate[], bandById: ReadonlyMap<number, CellARFCNBand>, plan: BandPlan | null): void {
  for (const cell of candidates) {
    if (cell.band_id === null || cell.band_id === undefined || !cell.rat) continue;

    const band = bandById.get(cell.band_id);
    if (!band) throw new ErrorResponse("BAD_REQUEST", { message: `Band ${cell.band_id} does not exist` });
    if (band.rat !== cell.rat) throw wrongTechnology(band.id, band.rat, cell.rat);
    if (plan !== null && !plan.bandIds.has(band.id)) throw unplannedBand(band.id, plan.countryCode);

    const arfcn = getCellARFCNForRat(cell.rat, cell.details);
    if (arfcn === null || arfcn === undefined || band.value === null) continue;
    if (!isChannelValidForBand({ rat: cell.rat, value: band.value, duplex: band.duplex, variant: band.variant, code: band.code }, arfcn)) {
      throw new ErrorResponse("BAD_REQUEST", { message: formatARFCNBandErrorMessage(cell.rat, band.value, arfcn) });
    }
  }
}

export async function validateCellBandsInCountry(candidates: CellARFCNCandidate[], countryCode: string | null): Promise<void> {
  const bandIds = [...new Set(candidates.flatMap((cell) => (cell.band_id !== null && cell.band_id !== undefined ? [cell.band_id] : [])))];
  if (bandIds.length === 0) return;

  const [bandRows, plannedRows] = await Promise.all([
    db.select().from(bands).where(inArray(bands.id, bandIds)),
    countryCode === null
      ? []
      : db
          .select({ bandId: countryBands.bandId })
          .from(countryBands)
          .where(and(eq(countryBands.countryCode, countryCode), inArray(countryBands.bandId, bandIds))),
  ]);
  const plan = countryCode === null ? null : { countryCode, bandIds: new Set(plannedRows.map((row) => row.bandId)) };
  validateCellBands(candidates, new Map(bandRows.map((band) => [band.id, band])), plan);
}

export async function assertStoredCellBandsFit(tx: DbTx, { cellIds, stationId }: StoredCellScope): Promise<void> {
  if (cellIds.length === 0 && stationId === null) return;

  const byId = cellIds.length > 0 ? inArray(cells.id, [...cellIds]) : undefined;
  const byStation = stationId === null ? undefined : eq(cells.station_id, stationId);
  const rows = await tx
    .select({ bandId: cells.band_id, rat: cells.rat, bandRat: bands.rat, countryCode: stationCountryCode, plannedBandId: countryBands.bandId })
    .from(cells)
    .innerJoin(bands, eq(bands.id, cells.band_id))
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .leftJoin(countryBands, and(eq(countryBands.bandId, cells.band_id), eq(countryBands.countryCode, stationCountryCode)))
    .where(or(byId, byStation));
  for (const row of rows) {
    if (row.bandRat !== row.rat) throw wrongTechnology(row.bandId, row.bandRat, row.rat);
    if (row.countryCode !== null && row.plannedBandId === null) throw unplannedBand(row.bandId, row.countryCode);
  }
}

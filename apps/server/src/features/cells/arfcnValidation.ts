import { isARFCNValidForBand } from "@openbts/shared/frequency";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";

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
  value: number | null;
  duplex: string | null;
};

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

export function getCellARFCNForRat(rat: string, details: unknown): number | null | undefined {
  const channelField = RAT_ARFCN_FIELDS[rat];
  if (!channelField) return undefined;
  return (details as CellARFCNDetails | null | undefined)?.[channelField];
}

export function validateCellARFCNsAgainstBands(candidates: CellARFCNCandidate[], bandById: ReadonlyMap<number, CellARFCNBand>): void {
  for (const cell of candidates) {
    if (cell.band_id === null || cell.band_id === undefined || !cell.rat) continue;

    const arfcn = getCellARFCNForRat(cell.rat, cell.details);
    if (arfcn === null || arfcn === undefined) continue;

    const band = bandById.get(cell.band_id);
    if (!band) continue;
    if (band.value === null) continue;
    if (!isARFCNValidForBand(cell.rat, band.value, arfcn, band.duplex))
      throw new ErrorResponse("BAD_REQUEST", { message: formatARFCNBandErrorMessage(cell.rat, band.value, arfcn) });
  }
}

export async function validateCellARFCNsForBands(candidates: CellARFCNCandidate[]): Promise<void> {
  const bandIds = [...new Set(candidates.flatMap((cell) => (cell.band_id !== null && cell.band_id !== undefined ? [cell.band_id] : [])))];
  if (bandIds.length === 0) return;

  const bandRows = await db.query.bands.findMany({
    where: {
      RAW: (fields, { inArray }) => inArray(fields.id, bandIds),
    },
  });
  const bandById = new Map(bandRows.map((band) => [band.id, band]));
  validateCellARFCNsAgainstBands(candidates, bandById);
}

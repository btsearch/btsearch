import type { TFunction } from "i18next";

import { toRatType } from "../utils/bands";
import { MISSING_VALUE, describeFieldChanges, formatBand } from "./fieldChanges";
import type { HistoryNames } from "./names";
import type { StationHistoryAction, StationHistoryCell } from "./types";
import type { RatType } from "@/features/shared/rat";

type HistoryCellGroup = { rat: RatType; cells: StationHistoryCell[] };
type HistoryCellValue = { key: string; label: string; value: string };

const IDENTITY_FIELDS: ReadonlySet<string> = new Set(["rat", "bandId"]);
const TITLE_SEPARATOR = " · ";

export function listHistoryCellGroups(cells: readonly StationHistoryCell[]): HistoryCellGroup[] {
  const cellsByRat = new Map<RatType, StationHistoryCell[]>();
  for (const cell of cells) {
    const rat = toRatType(cell.rat);
    const ratCells = cellsByRat.get(rat);
    if (ratCells === undefined) cellsByRat.set(rat, [cell]);
    else ratCells.push(cell);
  }
  return [...cellsByRat].map(([rat, ratCells]) => ({ rat, cells: ratCells }));
}

function getCellBandTitle(cell: StationHistoryCell, names: HistoryNames, t: TFunction): string {
  const technology = toRatType(cell.rat);
  const bandName = cell.bandId === null ? undefined : names.bands.get(cell.bandId);
  if (bandName !== undefined && bandName.toUpperCase().includes(technology)) return bandName;
  return `${technology} ${formatBand(cell.bandId, names, t)}`;
}

function getCellIdentifier(cell: StationHistoryCell): string | null {
  if (cell.rat === "lte" || cell.rat === "nr") return cell.clid === null ? null : `CLID ${cell.clid}`;
  return cell.cid === null ? null : `CID ${cell.cid}`;
}

export function getCellTitle(cell: StationHistoryCell, action: StationHistoryAction, names: HistoryNames, t: TFunction): string {
  const bandTitle = getCellBandTitle(cell, names, t);
  const identifier = action === "update" ? getCellIdentifier(cell) : null;
  return identifier === null ? bandTitle : `${bandTitle}${TITLE_SEPARATOR}${identifier}`;
}

export function describeCellValues(cell: StationHistoryCell, names: HistoryNames, t: TFunction): HistoryCellValue[] {
  const changes = cell.fields.filter((change) => !IDENTITY_FIELDS.has(change.field));
  return describeFieldChanges(changes, names, t).map(({ key, label, from, to }) => ({ key, label, value: to ?? from ?? MISSING_VALUE }));
}

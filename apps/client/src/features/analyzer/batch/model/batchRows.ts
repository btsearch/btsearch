import type { Band, Cell, CellType, Sector } from "@openbts/shared/contract";

import type { AnalyzerDraft, DraftRow, DraftStation } from "../../model/draft";
import { getBandCode, getBandLabel } from "@/features/station-details/station/utils/bands";
import type { LockedValue } from "@/features/station-editing/components/cells/lockedCellRow";
import { DEFAULT_CELL_TYPE, RAT_FIELDS, isCellNumberField } from "@/features/station-editing/model/ratFields";
import type { CellNumberField, Rat } from "@/features/station-editing/model/types";

export type BatchRow = DraftRow & { key: string };
export type BatchStation = { station: DraftStation; rows: BatchRow[] };
export type RowNumbers = Partial<Record<CellNumberField, number>>;
export type RowValues = Readonly<Partial<Record<string, LockedValue>>>;

export type RowValueContext = {
  bandsById: ReadonlyMap<number, Band>;
  sectorsById: ReadonlyMap<number, Sector>;
  language: string;
  unknownBandText: string;
  omnidirectionalText: string;
  missingValueTitle: string;
};

export const BAND_COLUMN_ID = "bandId";
export const SECTOR_COLUMN_ID = "sectorKey";

const CELL_TYPE_COLUMN_ID = "cellType";
const ROW_KEY_PREFIX = "r";
const DEGREE_SIGN = "°";
const KEY_SEPARATOR = ":";
const NO_VALUE = "";

export function toRowKey(index: number): string {
  return `${ROW_KEY_PREFIX}${index}`;
}

export function getRowRat(row: Pick<DraftRow, "observed">): Rat {
  return row.observed.rat;
}

export function isBandMissing(row: DraftRow): boolean {
  return row.action === "create" && row.bandId === null;
}

export function listBatchStations(draft: AnalyzerDraft): BatchStation[] {
  const rowsByStation = new Map<number, BatchRow[]>();
  for (const row of draft.rows) {
    const rows = rowsByStation.get(row.stationId) ?? [];
    rows.push({ ...row, key: toRowKey(row.index) });
    rowsByStation.set(row.stationId, rows);
  }

  return draft.stations.flatMap((station) => {
    const rows = rowsByStation.get(station.id);
    return rows === undefined ? [] : [{ station, rows }];
  });
}

export function readNumber(source: object, field: CellNumberField): number | null {
  const value: unknown = (source as Record<string, unknown>)[field];
  return typeof value === "number" ? value : null;
}

function listNumberFields(rat: Rat): CellNumberField[] {
  return RAT_FIELDS[rat].numbers.map((spec) => spec.field);
}

function getCreatedNumbers(row: DraftRow): RowNumbers {
  const numbers: RowNumbers = {};
  for (const field of listNumberFields(getRowRat(row))) {
    const value = readNumber(row.observed, field);
    if (value !== null) numbers[field] = value;
  }
  if (row.nrIdentity !== null) {
    numbers.gnbid = row.nrIdentity.gnbid;
    numbers.clid = row.nrIdentity.clid;
  }
  return numbers;
}

export function getRowNumbers(row: DraftRow): RowNumbers {
  if (row.action === "confirm") return {};
  if (row.action === "create") return getCreatedNumbers(row);

  const numbers: RowNumbers = {};
  for (const difference of row.differences) {
    if (isCellNumberField(difference.field)) numbers[difference.field] = difference.observed;
  }
  return numbers;
}

export function getNewCellKey(row: DraftRow, numbers: RowNumbers): string {
  return [getRowRat(row), numbers.enbid ?? numbers.gnbid ?? NO_VALUE, numbers.clid ?? NO_VALUE].join(KEY_SEPARATOR);
}

function toBandValue(bandId: number | null, context: RowValueContext): LockedValue {
  const band = bandId === null ? undefined : context.bandsById.get(bandId);
  if (band === undefined) return { text: context.unknownBandText, look: "plain", isMuted: true };

  const value: LockedValue = { text: getBandLabel(band, context.language) ?? band.name, look: "plain" };
  const code = getBandCode(band);
  if (code !== null) value.aside = code;
  return value;
}

function toSectorValue(stored: Cell | null, context: RowValueContext): LockedValue | undefined {
  const sector = stored === null || stored.sectorId === null ? undefined : context.sectorsById.get(stored.sectorId);
  if (sector === undefined) return undefined;
  return { text: sector.azimuth === null ? context.omnidirectionalText : `${sector.azimuth}${DEGREE_SIGN}`, look: "plain" };
}

function toCellTypeValue(cellType: CellType | null): LockedValue | undefined {
  if (cellType === null) return undefined;
  return { text: cellType, look: "plain", isMuted: cellType === DEFAULT_CELL_TYPE };
}

function toStoredNumberValues(row: DraftRow, stored: Cell, context: RowValueContext): Record<string, LockedValue> {
  const values: Record<string, LockedValue> = {};
  for (const field of listNumberFields(getRowRat(row))) {
    const value = readNumber(stored, field);
    if (value !== null) values[field] = { text: String(value), look: "plain" };
  }
  for (const difference of row.differences) {
    values[difference.field] =
      difference.stored === null
        ? { text: String(difference.observed), look: "added", title: context.missingValueTitle }
        : { text: String(difference.observed), look: "changed", struck: String(difference.stored) };
  }
  return values;
}

function toCreatedNumberValues(row: DraftRow): Record<string, LockedValue> {
  const values: Record<string, LockedValue> = {};
  for (const [field, value] of Object.entries(getCreatedNumbers(row))) values[field] = { text: String(value), look: "plain" };
  return values;
}

export function getRowValues(row: DraftRow, context: RowValueContext): RowValues {
  const { stored } = row;
  const values = stored === null ? toCreatedNumberValues(row) : toStoredNumberValues(row, stored, context);
  const sectorValue = toSectorValue(stored, context);
  const cellTypeValue = toCellTypeValue(stored === null ? DEFAULT_CELL_TYPE : stored.cellType);

  values[BAND_COLUMN_ID] = toBandValue(row.bandId, context);
  if (sectorValue !== undefined) values[SECTOR_COLUMN_ID] = sectorValue;
  if (cellTypeValue !== undefined) values[CELL_TYPE_COLUMN_ID] = cellTypeValue;
  return values;
}

import type { Cell, CellType, NrCell, NrMode } from "../types";
import { getBandSortValue, getCellChannel, toRatType } from "./bands";
import { type SectorIndex, findCellSector } from "./sectors";
import { RAT_ORDER, type RatType } from "@/features/shared/rat";
import { getRatDetailFields } from "@/features/shared/ratCellFields";
import { isRecent } from "@/lib/dateUtils";

export type CellIdentifierField = "lac" | "rnc" | "cid" | "longCid" | "bsic" | "psc" | "tac" | "enbid" | "gnbid" | "clid" | "eci" | "nci" | "pci";

export type CellColumn =
  | { kind: "band" }
  | { kind: "sector" }
  | { kind: "identifier"; field: CellIdentifierField; label: string; tooltip?: string }
  | { kind: "channel"; label: string; tooltip?: string }
  | { kind: "notes" };

type SharedCellValue = { field: CellIdentifierField; label: string; value: number };

export type CellFreshness = "new" | "updated";

export type CellTable = {
  rat: RatType;
  cells: Cell[];
  sharedValues: SharedCellValue[];
  columns: CellColumn[];
};

type TableLayout = {
  identifiers: readonly CellIdentifierField[];
  channel: string | null;
  hoistable: readonly CellIdentifierField[];
};

type CellIdentifiers = Partial<Record<CellIdentifierField, number | null>>;

const TABLE_LAYOUTS: Record<RatType, TableLayout> = {
  GSM: { identifiers: ["lac", "cid", "bsic"], channel: null, hoistable: ["lac"] },
  UMTS: { identifiers: ["lac", "rnc", "cid", "longCid", "psc"], channel: "UARFCN", hoistable: ["rnc", "lac"] },
  LTE: { identifiers: ["tac", "enbid", "clid", "eci", "pci"], channel: "EARFCN", hoistable: ["enbid", "tac"] },
  NR: { identifiers: ["tac", "gnbid", "clid", "nci", "pci"], channel: "ARFCN", hoistable: ["gnbid", "tac"] },
};

const IDENTIFIER_LABELS: Record<CellIdentifierField, string> = {
  lac: "LAC",
  rnc: "RNC",
  cid: "CID",
  longCid: "LongCID",
  bsic: "BSIC",
  psc: "PSC",
  tac: "TAC",
  enbid: "eNBID",
  gnbid: "gNBID",
  clid: "CLID",
  eci: "ECI",
  nci: "NCI",
  pci: "PCI",
};
const IDENTIFIER_LABELS_BY_FIELD: ReadonlyMap<string, string> = new Map(Object.entries(IDENTIFIER_LABELS));
const SITE_SWITCH_IDENTIFIER_TOOLTIPS: Partial<Record<CellIdentifierField, string>> = {
  bsic: "Base Station Identity Code",
  psc: "Primary Scrambling Code",
};
const CELL_TYPE_NAME_KEYS: Record<CellType, string> = {
  macro: "stations:cells.cellTypes.macrocell",
  micro: "stations:cells.cellTypes.microcell",
  pico: "stations:cells.cellTypes.picocell",
  femto: "stations:cells.cellTypes.femtocell",
};
const CELL_TYPE_NAME_KEYS_BY_TYPE: ReadonlyMap<string, string> = new Map(Object.entries(CELL_TYPE_NAME_KEYS));

const NCI_BITS = 36;
const ECI_ENBID_FACTOR = 256;
const LONG_CID_RNC_FACTOR = 65536;

export function getCellIdentifier(cell: Cell, field: CellIdentifierField): number | null {
  const identifiers: CellIdentifiers = cell;
  return identifiers[field] ?? null;
}

export function findCellIdentifierLabel(field: string): string | undefined {
  return IDENTIFIER_LABELS_BY_FIELD.get(field);
}

export function getNrMode(cell: Cell): NrMode | null {
  return cell.rat === "nr" ? cell.mode : null;
}

export function isEGsmCell(cell: Cell): boolean {
  return cell.rat === "gsm" && cell.isEGsm;
}

export function hasIotSupport(cell: Cell): boolean {
  return cell.rat === "lte" && cell.supportsIot;
}

export function hasRedCapSupport(cell: Cell): boolean {
  return cell.rat === "nr" && cell.supportsRedCap;
}

export function getCellNote(cell: Cell): string | null {
  return cell.notes === null || cell.notes === "" ? null : cell.notes;
}

export function getCellFreshness(cell: Cell): CellFreshness | null {
  if (isRecent(cell.createdAt)) return "new";
  return isRecent(cell.updatedAt) ? "updated" : null;
}

export function getCellTypeNameKey(cellType: CellType): string {
  return CELL_TYPE_NAME_KEYS[cellType];
}

export function findCellTypeNameKey(cellType: string): string | undefined {
  return CELL_TYPE_NAME_KEYS_BY_TYPE.get(cellType);
}

export function getColumnKey(column: CellColumn): string {
  return column.kind === "identifier" ? column.field : column.kind;
}

function getModeSortValue(cell: Cell): number {
  return cell.rat === "nr" && cell.mode !== "sa" ? 1 : 0;
}

function getStandaloneIdentity(cell: NrCell): number {
  if (cell.nci !== null) return cell.nci;

  const gnbid = cell.gnbid ?? 0;
  const gnbidBits = gnbid.toString(2).length;
  return gnbid * 2 ** (NCI_BITS - gnbidBits) + (cell.clid ?? 0);
}

function getIdentitySortValue(cell: Cell): number {
  if (cell.rat === "gsm") return cell.cid;
  if (cell.rat === "umts") return cell.longCid ?? (cell.rnc ?? 0) * LONG_CID_RNC_FACTOR + (cell.cid ?? 0);
  if (cell.rat === "lte") return cell.eci ?? (cell.enbid ?? 0) * ECI_ENBID_FACTOR + (cell.clid ?? 0);
  return cell.mode === "sa" ? getStandaloneIdentity(cell) : (cell.pci ?? 0);
}

function compareCells(left: Cell, right: Cell): number {
  return (
    getModeSortValue(left) - getModeSortValue(right) ||
    getBandSortValue(left.band) - getBandSortValue(right.band) ||
    getIdentitySortValue(left) - getIdentitySortValue(right)
  );
}

function findSharedValue(cells: readonly Cell[], field: CellIdentifierField): number | null {
  const values = new Set(cells.map((cell) => getCellIdentifier(cell, field)));
  if (values.size !== 1) return null;

  const [value] = values;
  return value;
}

function listSharedValues(rat: RatType, cells: readonly Cell[]): SharedCellValue[] {
  return TABLE_LAYOUTS[rat].hoistable.flatMap((field) => {
    const value = findSharedValue(cells, field);
    return value === null ? [] : [{ field, label: IDENTIFIER_LABELS[field], value }];
  });
}

function findHeaderTooltip(rat: RatType, label: string): string | undefined {
  return getRatDetailFields(rat).find((field) => field.label === label)?.tooltip;
}

function toIdentifierColumn(rat: RatType, field: CellIdentifierField): CellColumn {
  const label = IDENTIFIER_LABELS[field];
  return { kind: "identifier", field, label, tooltip: findHeaderTooltip(rat, label) ?? SITE_SWITCH_IDENTIFIER_TOOLTIPS[field] };
}

function toChannelColumn(rat: RatType, label: string): CellColumn {
  return { kind: "channel", label, tooltip: findHeaderTooltip(rat, label) };
}

function listColumns(rat: RatType, sharedValues: readonly SharedCellValue[]): CellColumn[] {
  const { identifiers, channel } = TABLE_LAYOUTS[rat];
  const hoistedFields = new Set(sharedValues.map((shared) => shared.field));
  const identifierColumns = identifiers.filter((field) => !hoistedFields.has(field)).map((field) => toIdentifierColumn(rat, field));
  const channelColumns = channel === null ? [] : [toChannelColumn(rat, channel)];

  return [{ kind: "band" }, { kind: "sector" }, ...identifierColumns, ...channelColumns, { kind: "notes" }];
}

function hasNotesContent(cell: Cell): boolean {
  return getCellNote(cell) !== null || hasIotSupport(cell) || hasRedCapSupport(cell) || getCellFreshness(cell) !== null;
}

function hasColumnContent(column: CellColumn, cells: readonly Cell[], sectorsById: SectorIndex): boolean {
  if (column.kind === "band") return true;
  if (column.kind === "sector") return cells.some((cell) => findCellSector(cell, sectorsById) !== null);
  if (column.kind === "channel") return cells.some((cell) => getCellChannel(cell) !== null);
  if (column.kind === "notes") return cells.some(hasNotesContent);

  const { field } = column;
  return cells.some((cell) => getCellIdentifier(cell, field) !== null);
}

function buildCellTable(rat: RatType, cells: readonly Cell[], sectorsById: SectorIndex): CellTable {
  const sortedCells = [...cells].sort(compareCells);
  const sharedValues = listSharedValues(rat, sortedCells);
  const columns = listColumns(rat, sharedValues).filter((column) => hasColumnContent(column, sortedCells, sectorsById));

  return { rat, cells: sortedCells, sharedValues, columns };
}

export function listCellTables(cells: readonly Cell[], sectorsById: SectorIndex): CellTable[] {
  return RAT_ORDER.flatMap((rat) => {
    const ratCells = cells.filter((cell) => toRatType(cell.rat) === rat);
    return ratCells.length === 0 ? [] : [buildCellTable(rat, ratCells, sectorsById)];
  });
}

import { type ComputedIdSpec, type FlagFieldSpec, type NumberFieldSpec, RAT_FIELDS, type SiteSwitch } from "../../model/ratFields";
import type { CellFlagField, CellNumberField, Rat, TextPart } from "../../model/types";

type ColumnBase = {
  id: string;
  width: number;
  label: TextPart;
  hint: TextPart | null;
};

export type CellColumn = ColumnBase &
  (
    | { kind: "band" | "sector" | "mode" | "gnbidLength" | "cellType" | "confirmed" }
    | { kind: "number"; spec: NumberFieldSpec }
    | { kind: "computed"; spec: ComputedIdSpec }
    | { kind: "flag"; spec: FlagFieldSpec }
  );

type CellGridOptions = {
  rat: Rat;
  hasConfirmedColumn: boolean;
  hasStandaloneCells: boolean;
  isAreaCodePerCell: boolean;
  switches: Record<SiteSwitch, boolean>;
};

export const NO_SITE_SWITCHES: Record<SiteSwitch, boolean> = { psc: false, bsic: false };

const COMPUTED_COLUMN_ID = "computedId";
const CACHE_KEY_SEPARATOR = "|";
const columnsByOptions = new Map<string, readonly CellColumn[]>();

const BAND_WIDTH = 92;
const SECTOR_WIDTH = 66;
const MODE_WIDTH = 62;
const CELL_TYPE_WIDTH = 74;
const CONFIRMED_WIDTH = 26;
const DEFAULT_NUMBER_WIDTH = 62;
const NOTE_ICON_WIDTH = 28;
const ROW_ACTIONS_WIDTH = 60;
const COLUMN_GAP = 6;
const TAIL_MIN_WIDTH = NOTE_ICON_WIDTH + COLUMN_GAP + ROW_ACTIONS_WIDTH;
const ROW_PADDING_WIDTH = 20;
const CARD_BORDER_WIDTH = 2;
const SHARE_PRECISION = 100_000;

export const GRID_ROW_CLASS = "grid grid-cols-(--cell-columns) gap-x-1.5 pr-2 pl-3";

const NUMBER_WIDTHS: Record<Rat, Partial<Record<CellNumberField, number>>> = {
  nr: { tac: 80, gnbid: 80, clid: 56, pci: 52, arfcn: 72 },
  lte: { tac: 62, enbid: 70, clid: 46, pci: 46, earfcn: 62 },
  umts: { lac: 62, rnc: 58, cid: 58, uarfcn: 60, psc: 46 },
  gsm: { lac: 62, cid: 58, bsic: 46 },
};
const COMPUTED_WIDTHS: Record<ComputedIdSpec["kind"], number> = { eci: 76, longCid: 84, nci: 92 };
const FLAG_WIDTHS: Record<CellFlagField, number> = { supportsIot: 30, isEGsm: 46, supportsRedCap: 44 };

const NUMBER_HINTS: Record<CellNumberField, TextPart> = {
  lac: { text: "Location Area Code" },
  tac: { text: "Tracking Area Code" },
  cid: { text: "Cell ID" },
  rnc: { text: "Radio Network Controller ID" },
  enbid: { text: "eNodeB ID" },
  gnbid: { text: "gNodeB ID" },
  clid: { key: "stations:edit.cells.hints.clid" },
  pci: { text: "Physical Cell ID" },
  psc: { text: "Primary Scrambling Code" },
  bsic: { text: "Base Station Identity Code" },
  uarfcn: { key: "stations:edit.cells.hints.channel" },
  earfcn: { key: "stations:edit.cells.hints.channel" },
  arfcn: { text: "NR-ARFCN" },
};
const COMPUTED_HINTS: Record<ComputedIdSpec["kind"], TextPart> = {
  eci: { key: "stations:edit.cells.hints.eci" },
  longCid: { key: "stations:edit.cells.hints.longCid" },
  nci: { key: "stations:edit.cells.hints.nci" },
};
const FLAG_HINTS: Record<CellFlagField, TextPart> = {
  supportsIot: { key: "stations:edit.cells.hints.iot" },
  isEGsm: { key: "stations:edit.cells.hints.eGsm" },
  supportsRedCap: { key: "stations:edit.cells.hints.redCap" },
};

const BAND_COLUMN: CellColumn = { kind: "band", id: "bandId", width: BAND_WIDTH, label: { key: "common:labels.band" }, hint: null };
const SECTOR_COLUMN: CellColumn = {
  kind: "sector",
  id: "sectorKey",
  width: SECTOR_WIDTH,
  label: { key: "common:labels.azimuth" },
  hint: { key: "stations:edit.cells.hints.sector" },
};
const MODE_COLUMN: CellColumn = {
  kind: "mode",
  id: "mode",
  width: MODE_WIDTH,
  label: { key: "stations:edit.cells.columns.mode" },
  hint: { key: "stations:edit.cells.hints.mode" },
};
const GNBID_LENGTH_COLUMN: CellColumn = {
  kind: "gnbidLength",
  id: "gnbidLength",
  width: 76,
  label: { key: "stations:edit.cells.columns.gnbidLength" },
  hint: { key: "stations:edit.cells.hints.gnbidLength" },
};
const CELL_TYPE_COLUMN: CellColumn = {
  kind: "cellType",
  id: "cellType",
  width: CELL_TYPE_WIDTH,
  label: { key: "stations:edit.cells.columns.cellType" },
  hint: null,
};
const CONFIRMED_COLUMN: CellColumn = {
  kind: "confirmed",
  id: "isConfirmed",
  width: CONFIRMED_WIDTH,
  label: { key: "common:labels.confirmed" },
  hint: null,
};

function toNumberColumn(rat: Rat, spec: NumberFieldSpec): CellColumn {
  const width = NUMBER_WIDTHS[rat][spec.field] ?? DEFAULT_NUMBER_WIDTH;
  return { kind: "number", id: spec.field, width, label: { text: spec.label }, hint: NUMBER_HINTS[spec.field], spec };
}

function toComputedColumn(spec: ComputedIdSpec): CellColumn {
  const width = COMPUTED_WIDTHS[spec.kind];
  return { kind: "computed", id: COMPUTED_COLUMN_ID, width, label: { text: spec.label }, hint: COMPUTED_HINTS[spec.kind], spec };
}

function toFlagColumn(spec: FlagFieldSpec): CellColumn {
  return { kind: "flag", id: spec.field, width: FLAG_WIDTHS[spec.field], label: { text: spec.label }, hint: FLAG_HINTS[spec.field], spec };
}

function listNumberColumns(options: CellGridOptions): CellColumn[] {
  const { rat, hasStandaloneCells, isAreaCodePerCell, switches } = options;
  const { numbers, areaCodeField, cellIdField, computedId } = RAT_FIELDS[rat];

  return numbers.flatMap((spec) => {
    const isSharedAreaCode = spec.field === areaCodeField && !isAreaCodePerCell;
    const isSwitchedOff = spec.siteSwitch !== null && !switches[spec.siteSwitch];
    if (isSharedAreaCode || isSwitchedOff || (spec.isSaOnly && !hasStandaloneCells)) return [];

    const column = toNumberColumn(rat, spec);
    if (rat === "nr" && spec.field === "gnbid") return [column, GNBID_LENGTH_COLUMN];
    return spec.field === cellIdField && computedId !== null ? [column, toComputedColumn(computedId)] : [column];
  });
}

function buildCellColumns(options: CellGridOptions): CellColumn[] {
  const { flags, hasMode } = RAT_FIELDS[options.rat];
  const flagColumns = flags.filter((spec) => !spec.isSaOnly || options.hasStandaloneCells).map(toFlagColumn);
  const columns: CellColumn[] = [BAND_COLUMN, SECTOR_COLUMN];

  if (hasMode) columns.push(MODE_COLUMN);
  columns.push(...listNumberColumns(options), ...flagColumns, CELL_TYPE_COLUMN);
  if (options.hasConfirmedColumn) columns.push(CONFIRMED_COLUMN);
  return columns;
}

export function listCellColumns(options: CellGridOptions): readonly CellColumn[] {
  const { rat, hasConfirmedColumn, hasStandaloneCells, isAreaCodePerCell, switches } = options;
  const cacheKey = [rat, hasConfirmedColumn, hasStandaloneCells, isAreaCodePerCell, switches.psc, switches.bsic].join(CACHE_KEY_SEPARATOR);
  const known = columnsByOptions.get(cacheKey);
  if (known !== undefined) return known;

  const columns = buildCellColumns(options);
  columnsByOptions.set(cacheKey, columns);
  return columns;
}

function sumColumnWidths(columns: readonly CellColumn[]): number {
  return columns.reduce((total, column) => total + column.width, 0);
}

export function getFullCardWidth(columns: readonly CellColumn[]): number {
  return sumColumnWidths(columns) + columns.length * COLUMN_GAP + TAIL_MIN_WIDTH + ROW_PADDING_WIDTH + CARD_BORDER_WIDTH;
}

export function toGridTemplate(columns: readonly CellColumn[], tailMinWidth = TAIL_MIN_WIDTH): string {
  const fullWidth = sumColumnWidths(columns);
  const reservedWidth = columns.length * COLUMN_GAP + tailMinWidth;
  const tracks = columns.map((column) => {
    const share = Math.floor((column.width / fullWidth) * SHARE_PRECISION) / SHARE_PRECISION;
    return `min(${column.width}px, calc((100% - ${reservedWidth}px) * ${share}))`;
  });
  return [...tracks, `minmax(${tailMinWidth}px, 1fr)`].join(" ");
}

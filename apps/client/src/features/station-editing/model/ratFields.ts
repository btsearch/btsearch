import type { CellType, NrMode } from "@openbts/shared/contract";

import type { AreaCodeField, CellDraft, CellFlagField, CellNumberField, Rat } from "./types";

export type SiteSwitch = "psc" | "bsic";

export type NumberFieldSpec = {
  field: CellNumberField;
  label: string;
  max: number;
  isSaOnly: boolean;
  siteSwitch: SiteSwitch | null;
};

export type FlagFieldSpec = {
  field: CellFlagField;
  label: string;
  isSaOnly: boolean;
};

export type ComputedIdSpec = {
  kind: "longCid" | "eci" | "nci";
  label: string;
};

type RatSpec = {
  rat: Rat;
  name: string;
  generation: string;
  numbers: readonly NumberFieldSpec[];
  flags: readonly FlagFieldSpec[];
  areaCodeField: AreaCodeField;
  nodeField: CellNumberField | null;
  cellIdField: CellNumberField | null;
  channelField: CellNumberField | null;
  computedId: ComputedIdSpec | null;
  hasMode: boolean;
};

type IdentifiedCell = Pick<CellDraft, "rat" | "numbers" | "gnbidLength">;
type ModedCell = Pick<CellDraft, "rat" | "mode">;

export const RAT_ORDER: readonly Rat[] = ["nr", "lte", "umts", "gsm"];
export const MAX_SECTORS = 15;
export const OMNIDIRECTIONAL_DEGREES = 360;
export const MAX_CELL_CHANGES = 200;
export const DEFAULT_CELL_TYPE: CellType = "macro";
export const DEFAULT_NR_MODE: NrMode = "nsa";

const DEFAULT_GNBID_LENGTH = 24;
const NCI_BITS = 36;
const ECI_ENBID_FACTOR = 256;
const LONG_CID_RNC_FACTOR = 65536;
const MAX_16_BIT = 65535;

export const CELL_NUMBER_LABELS: Record<CellNumberField, string> = {
  lac: "LAC",
  cid: "CID",
  rnc: "RNC",
  enbid: "eNBID",
  gnbid: "gNBID",
  clid: "CLID",
  tac: "TAC",
  pci: "PCI",
  psc: "PSC",
  bsic: "BSIC",
  uarfcn: "UARFCN",
  earfcn: "EARFCN",
  arfcn: "ARFCN",
};

export const CELL_FLAG_LABELS: Record<CellFlagField, string> = {
  isEGsm: "E-GSM",
  supportsIot: "IoT",
  supportsRedCap: "RedCap",
};

function numberField(field: CellNumberField, max: number): NumberFieldSpec {
  return { field, label: CELL_NUMBER_LABELS[field], max, isSaOnly: false, siteSwitch: null };
}

function saOnlyField(field: CellNumberField, max: number): NumberFieldSpec {
  return { field, label: CELL_NUMBER_LABELS[field], max, isSaOnly: true, siteSwitch: null };
}

function switchedField(field: SiteSwitch, max: number): NumberFieldSpec {
  return { field, label: CELL_NUMBER_LABELS[field], max, isSaOnly: false, siteSwitch: field };
}

export const RAT_FIELDS: Record<Rat, RatSpec> = {
  nr: {
    rat: "nr",
    name: "NR",
    generation: "5G",
    numbers: [
      saOnlyField("tac", 16_777_215),
      saOnlyField("gnbid", 2_147_483_647),
      saOnlyField("clid", 16_383),
      numberField("pci", 1007),
      numberField("arfcn", 3_279_165),
    ],
    flags: [{ field: "supportsRedCap", label: CELL_FLAG_LABELS.supportsRedCap, isSaOnly: true }],
    areaCodeField: "tac",
    nodeField: "gnbid",
    cellIdField: "clid",
    channelField: "arfcn",
    computedId: { kind: "nci", label: "NCI" },
    hasMode: true,
  },
  lte: {
    rat: "lte",
    name: "LTE",
    generation: "4G",
    numbers: [
      numberField("tac", MAX_16_BIT),
      numberField("enbid", 1_048_575),
      numberField("clid", 255),
      numberField("pci", 503),
      numberField("earfcn", 262_143),
    ],
    flags: [{ field: "supportsIot", label: CELL_FLAG_LABELS.supportsIot, isSaOnly: false }],
    areaCodeField: "tac",
    nodeField: "enbid",
    cellIdField: "clid",
    channelField: "earfcn",
    computedId: { kind: "eci", label: "ECI" },
    hasMode: false,
  },
  umts: {
    rat: "umts",
    name: "UMTS",
    generation: "3G",
    numbers: [
      numberField("lac", MAX_16_BIT),
      numberField("rnc", MAX_16_BIT),
      numberField("cid", MAX_16_BIT),
      numberField("uarfcn", 16_383),
      switchedField("psc", 511),
    ],
    flags: [],
    areaCodeField: "lac",
    nodeField: "rnc",
    cellIdField: "cid",
    channelField: "uarfcn",
    computedId: { kind: "longCid", label: "LongCID" },
    hasMode: false,
  },
  gsm: {
    rat: "gsm",
    name: "GSM",
    generation: "2G",
    numbers: [numberField("lac", MAX_16_BIT), numberField("cid", MAX_16_BIT), switchedField("bsic", 63)],
    flags: [{ field: "isEGsm", label: CELL_FLAG_LABELS.isEGsm, isSaOnly: false }],
    areaCodeField: "lac",
    nodeField: null,
    cellIdField: "cid",
    channelField: null,
    computedId: null,
    hasMode: false,
  },
};

const NUMBER_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(CELL_NUMBER_LABELS));
const FLAG_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(CELL_FLAG_LABELS));

export function isCellNumberField(field: string): field is CellNumberField {
  return NUMBER_FIELD_NAMES.has(field);
}

export function isCellFlagField(field: string): field is CellFlagField {
  return FLAG_FIELD_NAMES.has(field);
}

export function findNumberFieldSpec(rat: Rat, field: CellNumberField): NumberFieldSpec | null {
  return RAT_FIELDS[rat].numbers.find((spec) => spec.field === field) ?? null;
}

export function getAreaCodeField(rat: Rat): AreaCodeField {
  return RAT_FIELDS[rat].areaCodeField;
}

export function getAreaCodeMax(rat: Rat): number {
  return findNumberFieldSpec(rat, getAreaCodeField(rat))?.max ?? MAX_16_BIT;
}

export function carriesAreaCode(cell: ModedCell): boolean {
  return cell.rat !== "nr" || cell.mode === "sa";
}

export function isFieldInUse(cell: ModedCell, spec: Pick<NumberFieldSpec | FlagFieldSpec, "isSaOnly">): boolean {
  return !spec.isSaOnly || cell.mode === "sa";
}

export function getCellNumber(cell: Pick<CellDraft, "numbers">, field: CellNumberField): number | null {
  return cell.numbers[field] ?? null;
}

export function getCellFlag(cell: Pick<CellDraft, "flags">, field: CellFlagField): boolean {
  return cell.flags[field] ?? false;
}

function isKnownNode(value: number | null): value is number {
  return value !== null && value !== 0;
}

export function computeCellId(cell: IdentifiedCell): number | null {
  const { nodeField, cellIdField, computedId } = RAT_FIELDS[cell.rat];
  if (computedId === null || nodeField === null || cellIdField === null) return null;

  const node = getCellNumber(cell, nodeField);
  const cellId = getCellNumber(cell, cellIdField);
  if (!isKnownNode(node) || cellId === null) return null;
  if (computedId.kind === "longCid") return node * LONG_CID_RNC_FACTOR + cellId;
  if (computedId.kind === "eci") return node * ECI_ENBID_FACTOR + cellId;
  return node * 2 ** (NCI_BITS - (cell.gnbidLength ?? DEFAULT_GNBID_LENGTH)) + cellId;
}

export function toAzimuth(degrees: number): number | null {
  return degrees === OMNIDIRECTIONAL_DEGREES ? null : degrees;
}

export function toDegrees(azimuth: number | null): number {
  return azimuth ?? OMNIDIRECTIONAL_DEGREES;
}

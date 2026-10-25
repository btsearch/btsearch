import {
  CELL_RATS,
  type CellRat,
  type MeasurementDeviceModel,
  type MeasurementModemFamily,
  type MeasurementReaderVersion,
  type MeasurementReadingBlockCreate,
  READING_BLOCK_FIELDS,
  READING_BLOCK_HELD_FIELDS,
  READING_BLOCK_ROLES,
} from "@openbts/shared/contract";

import type { ReaderQuirkFlag } from "../api/readingBlocks";
import type { PhonesKind, ReadingBlockField, ReadingBlockPhones, ReadingBlockRole } from "./blockText";

type ReadingBlockMode = MeasurementReadingBlockCreate["mode"];

export type BlockDialogSource =
  | { kind: "new" }
  | { kind: "flag"; flag: ReaderQuirkFlag }
  | { kind: "readerVersion"; readerVersion: MeasurementReaderVersion };

export type BlockDraft = {
  phonesKind: PhonesKind;
  modemFamily: MeasurementModemFamily | null;
  socId: number | null;
  deviceModel: MeasurementDeviceModel | null;
  readerVersionId: number | null;
  fields: readonly ReadingBlockField[];
  mode: ReadingBlockMode;
  technologies: readonly CellRat[];
  roles: readonly ReadingBlockRole[];
  sdkIntMin: string;
  sdkIntMax: string;
  radioVersionPrefix: string;
  reason: string;
  refold: boolean;
};

export type SdkLimitError = "range" | "order" | null;

const SDK_INT_MIN = 1;
const SDK_INT_MAX = 1000;
export const RADIO_VERSION_PREFIX_MAX_LENGTH = 128;

const NEW_DRAFT: BlockDraft = {
  phonesKind: "modemFamily",
  modemFamily: null,
  socId: null,
  deviceModel: null,
  readerVersionId: null,
  fields: [],
  mode: "drop",
  technologies: [],
  roles: [],
  sdkIntMin: "",
  sdkIntMax: "",
  radioVersionPrefix: "",
  reason: "",
  refold: false,
};

const WHOLE_NUMBER_PATTERN = /^\d+$/;

function draftPhones(phones: ReadingBlockPhones, flag: ReaderQuirkFlag): Partial<BlockDraft> {
  if ("modemFamily" in phones) return { phonesKind: "modemFamily", modemFamily: phones.modemFamily };
  if ("socId" in phones) return { phonesKind: "soc", socId: phones.socId };
  if ("readerVersionId" in phones) return { phonesKind: "readerVersion", readerVersionId: phones.readerVersionId };

  const { deviceModel } = flag.evidence;
  const model = deviceModel !== null && deviceModel.id === phones.deviceModelId ? { ...deviceModel, socId: null } : null;
  return { phonesKind: "deviceModel", deviceModel: model };
}

export function createBlockDraft(source: BlockDialogSource): BlockDraft {
  if (source.kind === "readerVersion") return { ...NEW_DRAFT, phonesKind: "readerVersion", readerVersionId: source.readerVersion.id, refold: true };
  if (source.kind === "new") return NEW_DRAFT;

  const suggestion = source.flag.suggestion?.readingBlock;
  if (suggestion === undefined) return { ...NEW_DRAFT, refold: true };
  return { ...NEW_DRAFT, ...draftPhones(suggestion.phones, source.flag), fields: suggestion.fields, mode: suggestion.mode, refold: true };
}

export function canCorroborate(fields: readonly ReadingBlockField[]): boolean {
  return fields.length > 0 && fields.every((field) => (READING_BLOCK_HELD_FIELDS as readonly string[]).includes(field));
}

export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function readSdkInt(text: string): number | null {
  const trimmed = text.trim();
  if (!WHOLE_NUMBER_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= SDK_INT_MIN && value <= SDK_INT_MAX ? value : null;
}

export function readSdkLimitErrors(draft: BlockDraft): { min: SdkLimitError; max: SdkLimitError } {
  const min = readSdkInt(draft.sdkIntMin);
  const max = readSdkInt(draft.sdkIntMax);
  const minError = draft.sdkIntMin.trim() !== "" && min === null ? "range" : null;
  if (draft.sdkIntMax.trim() !== "" && max === null) return { min: minError, max: "range" };
  return { min: minError, max: min !== null && max !== null && max < min ? "order" : null };
}

function toPhones(draft: BlockDraft): ReadingBlockPhones | null {
  if (draft.phonesKind === "modemFamily") return draft.modemFamily === null ? null : { modemFamily: draft.modemFamily };
  if (draft.phonesKind === "soc") return draft.socId === null ? null : { socId: draft.socId };
  if (draft.phonesKind === "deviceModel") return draft.deviceModel === null ? null : { deviceModelId: draft.deviceModel.id };
  return draft.readerVersionId === null ? null : { readerVersionId: draft.readerVersionId };
}

function inOrder<T>(order: readonly T[], values: readonly T[]): T[] {
  return order.filter((value) => values.includes(value));
}

export function toBlockCreate(draft: BlockDraft): MeasurementReadingBlockCreate | null {
  const phones = toPhones(draft);
  const reason = draft.reason.trim();
  const sdkErrors = readSdkLimitErrors(draft);
  if (phones === null || reason === "" || sdkErrors.min !== null || sdkErrors.max !== null) return null;

  const block: MeasurementReadingBlockCreate = { phones, mode: "drop", reason, refold: draft.refold };
  if (draft.fields.length > 0) {
    block.fields = inOrder(READING_BLOCK_FIELDS, draft.fields);
    block.mode = canCorroborate(draft.fields) ? draft.mode : "drop";
    if (draft.technologies.length > 0) block.technologies = inOrder(CELL_RATS, draft.technologies);
    if (draft.roles.length > 0) block.roles = inOrder(READING_BLOCK_ROLES, draft.roles);
  }

  const sdkIntMin = readSdkInt(draft.sdkIntMin);
  const sdkIntMax = readSdkInt(draft.sdkIntMax);
  const radioVersionPrefix = draft.radioVersionPrefix.trim();
  if (sdkIntMin !== null) block.sdkIntMin = sdkIntMin;
  if (sdkIntMax !== null) block.sdkIntMax = sdkIntMax;
  if (radioVersionPrefix !== "") block.radioVersionPrefix = radioVersionPrefix;
  return block;
}

import type { SettingsMeasurements } from "@openbts/shared/contract";

export type MeasurementField = "minAppVersionCode" | "termsVersion" | "rawRetentionDays" | "rawStorageBudgetGib" | "publicRadiusMaxMeters";
export type MeasurementEdits = Partial<Record<MeasurementField, string>>;
export type MeasurementChanges = Partial<Pick<SettingsMeasurements, MeasurementField>>;

type FieldRange = { min: number; max: number };

export const BYTES_PER_GIB = 1024 ** 3;

const FIELD_RANGES = {
  minAppVersionCode: { min: 1, max: 2_100_000_000 },
  termsVersion: { min: 1, max: 32_767 },
  rawRetentionDays: { min: 1, max: 3650 },
  rawStorageBudgetGib: { min: 1, max: 100_000 },
  publicRadiusMaxMeters: { min: 100, max: 10_000 },
} as const satisfies Record<MeasurementField, FieldRange>;

const SPACES = /\s/g;
const WHOLE_NUMBER = /^\d+$/;

export function readFieldRange(field: MeasurementField): FieldRange {
  return FIELD_RANGES[field];
}

export function parseFieldValue(field: MeasurementField, text: string): number | null {
  const compact = text.replace(SPACES, "");
  if (!WHOLE_NUMBER.test(compact)) return null;

  const value = Number(compact);
  const { min, max } = FIELD_RANGES[field];
  return value >= min && value <= max ? value : null;
}

export function readFieldText(saved: SettingsMeasurements, edits: MeasurementEdits, field: MeasurementField): string {
  return edits[field] ?? String(saved[field]);
}

export function readMeasurementDraft(saved: SettingsMeasurements, edits: MeasurementEdits, fields: readonly MeasurementField[]) {
  const changes: MeasurementChanges = {};
  let isDirty = false;
  let isInvalid = false;

  for (const field of fields) {
    const text = readFieldText(saved, edits, field);
    const value = parseFieldValue(field, text);
    if (text !== String(saved[field])) isDirty = true;
    if (value === null) isInvalid = true;
    else if (value !== saved[field]) changes[field] = value;
  }

  return { changes, isDirty, isInvalid };
}

export function dropSubmittedEdits(edits: MeasurementEdits, submitted: MeasurementEdits, fields: readonly MeasurementField[]): MeasurementEdits {
  const unsavedEdits: MeasurementEdits = {};
  for (const field of fields) {
    const text = edits[field];
    if (text !== undefined && text !== submitted[field]) unsavedEdits[field] = text;
  }
  return unsavedEdits;
}

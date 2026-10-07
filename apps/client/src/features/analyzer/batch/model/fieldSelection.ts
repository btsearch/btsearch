import type { DraftRow } from "../../model/draft";
import { type BatchRow, readNumber } from "./batchRows";
import { isCellNumberField } from "@/features/station-editing/model/ratFields";
import type { CellNumberField, Rat } from "@/features/station-editing/model/types";

export type ExcludedFields = ReadonlyMap<number, ReadonlySet<CellNumberField>>;
export type FieldChoice = {
  index: number;
  stationId: number;
  rat: Rat;
  field: CellNumberField;
  value: number;
  stored: number | null;
  required: boolean;
};

const OPTIONAL_FIELDS: Record<Rat, readonly CellNumberField[]> = {
  gsm: ["lac"],
  umts: ["lac", "uarfcn", "rnc"],
  lte: ["tac", "pci", "earfcn"],
  nr: [],
};
const CREATE_FIELDS = ["tac", "enbid", "clid", "pci", "earfcn"] as const;
const knownRows = new WeakMap<BatchRow, WeakMap<ReadonlySet<CellNumberField>, BatchRow>>();

export function listFieldChoices(row: DraftRow): FieldChoice[] {
  const { index, stationId, observed } = row;
  const rat = observed.rat;
  if (row.action === "update") {
    return row.differences.flatMap(({ field, observed: value, stored }) =>
      isCellNumberField(field) && OPTIONAL_FIELDS[rat].includes(field) ? [{ index, stationId, rat, field, value, stored, required: false }] : [],
    );
  }
  if (row.action !== "create" || rat !== "lte") return [];

  return CREATE_FIELDS.flatMap((field) => {
    const value = readNumber(observed, field);
    if (value === null) return [];
    const required = field === "tac" || field === "enbid" || field === "clid";
    return [{ index, stationId, rat, field, value, stored: null, required }];
  });
}

export function isFieldIncluded(choice: FieldChoice, excluded: ExcludedFields): boolean {
  return choice.required || !excluded.get(choice.index)?.has(choice.field);
}

function projectRow(row: BatchRow, excluded: ReadonlySet<CellNumberField>): BatchRow {
  if (row.action === "update") {
    const differences = row.differences.filter(
      ({ field }) => !isCellNumberField(field) || !OPTIONAL_FIELDS[row.observed.rat].includes(field) || !excluded.has(field),
    );
    return differences.length === row.differences.length ? row : { ...row, differences };
  }
  if (row.action !== "create" || row.observed.rat !== "lte") return row;
  if (!excluded.has("pci") && !excluded.has("earfcn")) return row;

  const { pci, earfcn, ...observed } = row.observed;
  return {
    ...row,
    observed: {
      ...observed,
      ...(excluded.has("pci") ? {} : { pci }),
      ...(excluded.has("earfcn") ? {} : { earfcn }),
    },
  };
}

export function selectBatchRow(row: BatchRow, excluded: ReadonlySet<CellNumberField> | undefined): BatchRow {
  if (excluded === undefined || excluded.size === 0) return row;
  const known = knownRows.get(row) ?? new WeakMap<ReadonlySet<CellNumberField>, BatchRow>();
  knownRows.set(row, known);
  const cached = known.get(excluded);
  if (cached !== undefined) return cached;
  const selected = projectRow(row, excluded);
  known.set(excluded, selected);
  return selected;
}

export function hasRowChanges(row: DraftRow): boolean {
  return row.action !== "update" || row.differences.length > 0;
}

import type { BuiltEntry, BuiltStation } from "./bodies";
import { findNumberFieldSpec, isCellNumberField } from "@/features/station-editing/model/ratFields";
import {
  INDEX_PATTERN,
  type ListedRefusal,
  PATH_SEPARATOR,
  type RefusalText,
  VALIDATION_CODE,
  findRefusalText,
  listRefusals,
} from "@/features/station-editing/model/serverRefusals";
import type { TextValues } from "@/features/station-editing/model/types";

export type BatchRefusal = {
  stationId: number | null;
  rowIndexes: number[];
  messageKey: string;
  values?: TextValues;
};

type RefusalPointer = {
  station: BuiltStation | null;
  entry: BuiltEntry | null;
  leaf: string | null;
};

type InvalidField = ListedRefusal["fields"][number];

const NOT_FOUND_CODE = "NOT_FOUND";
const RESOURCE_GONE_MESSAGE = "The requested resource was not found.";
const STATION_GONE_KEY = "stations:edit.refusals.stationGone";
const RANGE_KEY = "stations:edit.errors.range";
const INVALID_FIELD_KEY = "stations:edit.refusals.invalidField";
const CELLS_SEGMENT = "cells";
const CELL_ID_PATTERN = /\bcell (\d+)\b/i;
const NO_POINTER: RefusalPointer = { station: null, entry: null, leaf: null };

function readPointer(path: string | undefined, sources: readonly BuiltStation[]): RefusalPointer {
  const [first = "", second, third = "", fourth] = (path ?? "").split(PATH_SEPARATOR).filter((segment) => segment !== "");
  const station = INDEX_PATTERN.test(first) ? sources[Number(first)] : undefined;
  if (station === undefined) return NO_POINTER;

  const entry = second === CELLS_SEGMENT && INDEX_PATTERN.test(third) ? station.entries[Number(third)] : undefined;
  return { station, entry: entry ?? null, leaf: fourth ?? null };
}

function listNamedCellRows(station: BuiltStation, message: string): number[] {
  const match = CELL_ID_PATTERN.exec(message);
  if (match === null) return [];

  const cellId = Number(match[1]);
  return station.entries.flatMap((entry) => (entry.change.action === "update" && entry.change.id === cellId ? entry.rowIndexes : []));
}

function toRefusalLine(pointer: RefusalPointer, rowIndexes: number[], text: RefusalText): BatchRefusal {
  const line: BatchRefusal = { stationId: pointer.station === null ? null : pointer.station.stationId, rowIndexes, messageKey: text.messageKey };
  if (text.values !== undefined) line.values = text.values;
  return line;
}

function toInvalidFieldLine(field: InvalidField, sources: readonly BuiltStation[]): BatchRefusal {
  const pointer = readPointer(field.path, sources);
  const { entry, leaf } = pointer;
  const spec = entry !== null && leaf !== null && isCellNumberField(leaf) ? findNumberFieldSpec(entry.rat, leaf) : null;
  const text: RefusalText =
    spec === null
      ? { messageKey: INVALID_FIELD_KEY, values: { message: field.message } }
      : { messageKey: RANGE_KEY, values: { field: spec.label, max: spec.max } };

  return toRefusalLine(pointer, entry === null ? [] : entry.rowIndexes, text);
}

function toRefusalLines(refusal: ListedRefusal, sources: readonly BuiltStation[]): BatchRefusal[] {
  if (refusal.code === VALIDATION_CODE && refusal.fields.length > 0) return refusal.fields.map((field) => toInvalidFieldLine(field, sources));

  const pointer = readPointer(refusal.fields.at(0)?.path, sources);
  const { station, entry } = pointer;
  const isStationGone = station !== null && refusal.code === NOT_FOUND_CODE && refusal.message === RESOURCE_GONE_MESSAGE;
  const text = isStationGone ? { messageKey: STATION_GONE_KEY } : findRefusalText(refusal);
  const namedRows = station === null ? [] : listNamedCellRows(station, refusal.message);

  return [toRefusalLine(pointer, entry === null ? namedRows : entry.rowIndexes, text)];
}

export function toBatchRefusals(error: unknown, sources: readonly BuiltStation[]): BatchRefusal[] {
  return listRefusals(error).flatMap((refusal) => toRefusalLines(refusal, sources));
}

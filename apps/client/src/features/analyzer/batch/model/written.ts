import type { Cell, CellApplyAnswer } from "@openbts/shared/contract";

import type { RowNumbers } from "./batchRows";
import type { BuiltEntry, BuiltStation } from "./bodies";
import { isCellNumberField } from "@/features/station-editing/model/ratFields";

type WrittenKind = "created" | "updated" | "confirmed" | "spread";
export type WrittenLine = { cell: Cell; kind: WrittenKind; numbers: RowNumbers };
export type WrittenStation = { stationId: number; lines: WrittenLine[] };

function readChangedNumbers(entry: BuiltEntry | undefined): RowNumbers {
  const numbers: RowNumbers = {};
  if (entry === undefined) return numbers;

  for (const [field, value] of Object.entries(entry.change)) {
    if (isCellNumberField(field) && typeof value === "number") numbers[field] = value;
  }
  return numbers;
}

function toSpreadLine(cell: Cell): WrittenLine {
  return { cell, kind: "spread", numbers: cell.rat === "lte" && cell.tac !== null ? { tac: cell.tac } : {} };
}

function toWrittenLines(cells: readonly Cell[], source: BuiltStation | undefined): WrittenLine[] {
  const entries = source === undefined ? [] : source.entries;
  const createdCount = entries.filter((entry) => entry.change.action === "create").length;
  const updates = entries.filter((entry) => entry.change.action === "update");

  return cells.map((cell, position): WrittenLine => {
    if (position < createdCount) return { cell, kind: "created", numbers: {} };
    if (position >= createdCount + updates.length) return toSpreadLine(cell);

    const numbers = readChangedNumbers(updates[position - createdCount]);
    return { cell, kind: Object.keys(numbers).length === 0 ? "confirmed" : "updated", numbers };
  });
}

export function toWrittenStations(answer: CellApplyAnswer, sources: readonly BuiltStation[]): WrittenStation[] {
  return answer.data.map(({ stationId, cells }) => ({
    stationId,
    lines: toWrittenLines(
      cells,
      sources.find((source) => source.stationId === stationId),
    ),
  }));
}

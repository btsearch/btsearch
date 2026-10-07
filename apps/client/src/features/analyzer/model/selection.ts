import type { AnalyzerViewer, RowFacts } from "./types";

export type TickMark = "on" | "mixed" | "off" | "none";
export type SelectionSummary = { rowCount: number; stationCount: number; outsideCount: number; pageCount: number; matchingCount: number };
export type SelectionProblem =
  | { kind: "overStationCap"; cap: number }
  | { kind: "allowanceUsedUp"; limit: number; resetsAt: string | null }
  | { kind: "overAllowance"; remaining: number };
export type Allowance =
  | { status: "unknown" }
  | { status: "exempt" }
  | { status: "limited"; limit: number; remaining: number; resetsAt: string | null };

function canTickRow(facts: readonly RowFacts[], index: number): boolean {
  return facts[index]?.tick.canTick === true;
}

export function getTickMark(indexes: readonly number[], facts: readonly RowFacts[], selected: ReadonlySet<number>): TickMark {
  let tickableCount = 0;
  let tickedCount = 0;

  for (const index of indexes) {
    if (!canTickRow(facts, index)) continue;
    tickableCount += 1;
    if (selected.has(index)) tickedCount += 1;
  }
  if (tickableCount === 0) return "none";
  if (tickedCount === 0) return "off";
  return tickedCount === tickableCount ? "on" : "mixed";
}

export function toggleRows(selected: ReadonlySet<number>, indexes: readonly number[], facts: readonly RowFacts[], isTicked: boolean): Set<number> {
  const next = new Set(selected);

  for (const index of indexes) {
    if (!canTickRow(facts, index)) continue;
    if (isTicked) next.add(index);
    else next.delete(index);
  }
  return next;
}

export function summarizeSelection(
  selected: ReadonlySet<number>,
  facts: readonly RowFacts[],
  filtered: readonly number[],
  pageRows: readonly number[],
): SelectionSummary {
  const stationIds = new Set<number>();
  for (const index of selected) {
    const stationId = facts[index]?.stationId ?? null;
    if (stationId !== null) stationIds.add(stationId);
  }

  let insideCount = 0;
  let matchingCount = 0;
  for (const index of filtered) {
    if (selected.has(index)) insideCount += 1;
    if (canTickRow(facts, index)) matchingCount += 1;
  }

  return {
    rowCount: selected.size,
    stationCount: stationIds.size,
    outsideCount: selected.size - insideCount,
    pageCount: pageRows.filter((index) => selected.has(index)).length,
    matchingCount,
  };
}

export function getSelectionProblem(summary: SelectionSummary, viewer: AnalyzerViewer, allowance: Allowance): SelectionProblem | null {
  if (summary.stationCount > viewer.stationCap) return { kind: "overStationCap", cap: viewer.stationCap };
  if (allowance.status !== "limited") return null;
  if (allowance.remaining <= 0) return { kind: "allowanceUsedUp", limit: allowance.limit, resetsAt: allowance.resetsAt };
  return summary.stationCount > allowance.remaining ? { kind: "overAllowance", remaining: allowance.remaining } : null;
}

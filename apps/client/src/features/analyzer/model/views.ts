import type { AnalyzerFilters } from "./filters";
import type { MatchTables, RowFacts, RowStatus } from "./types";
import { FIRST_LIST_PAGE, getListPageCount } from "@/features/stations/list/data/listPaging";

export type TableItem = { kind: "station"; stationId: number; rowIndexes: readonly number[] } | { kind: "row"; index: number };

const STATUS_RANKS: Record<RowStatus, number> = { found: 0, probable: 1, notFound: 2, pending: 3 };
const SMALLEST_PAGE_SIZE = 1;
const siteIdCollator = new Intl.Collator(undefined, { numeric: true });

function rankStations(indexes: readonly number[], facts: readonly RowFacts[], tables: MatchTables): Map<number, number> {
  const stationIds = new Set<number>();
  for (const index of indexes) {
    const stationId = facts[index].stationId;
    if (stationId !== null) stationIds.add(stationId);
  }

  const ordered = [...stationIds].sort((left, right) => {
    const leftSiteId = tables.stationsById.get(left)?.siteId ?? "";
    const rightSiteId = tables.stationsById.get(right)?.siteId ?? "";
    return siteIdCollator.compare(leftSiteId, rightSiteId) || left - right;
  });
  return new Map(ordered.map((stationId, rank) => [stationId, rank]));
}

export function sortIndexes(indexes: readonly number[], facts: readonly RowFacts[], tables: MatchTables, sort: AnalyzerFilters["sort"]): number[] {
  const sorted = [...indexes];
  if (sort === "file") return sorted.sort((left, right) => left - right);
  if (sort === "result") {
    return sorted.sort((left, right) => STATUS_RANKS[facts[left].status] - STATUS_RANKS[facts[right].status] || left - right);
  }

  const stationRanks = rankStations(indexes, facts, tables);
  const lastRank = stationRanks.size;

  function getRank(index: number): number {
    const stationId = facts[index].stationId;
    return stationId === null ? lastRank : (stationRanks.get(stationId) ?? lastRank);
  }

  return sorted.sort((left, right) => getRank(left) - getRank(right) || left - right);
}

function groupByStation(sorted: readonly number[], facts: readonly RowFacts[]): { grouped: number[]; rowsByStation: Map<number, number[]> } {
  const rowsByStation = new Map<number, number[]>();
  const withoutStation: number[] = [];

  for (const index of sorted) {
    const stationId = facts[index].stationId;
    if (stationId === null) {
      withoutStation.push(index);
      continue;
    }
    const stationRows = rowsByStation.get(stationId) ?? [];
    stationRows.push(index);
    rowsByStation.set(stationId, stationRows);
  }
  return { grouped: [...[...rowsByStation.values()].flat(), ...withoutStation], rowsByStation };
}

function slicePage(indexes: readonly number[], page: number, pageSize: number): number[] {
  const size = Math.max(SMALLEST_PAGE_SIZE, Math.round(pageSize));
  const shownPage = Math.min(Math.max(FIRST_LIST_PAGE, page), getListPageCount(indexes.length, size));
  const start = (shownPage - FIRST_LIST_PAGE) * size;
  return indexes.slice(start, start + size);
}

export function listPageItems(
  sorted: readonly number[],
  facts: readonly RowFacts[],
  filters: Pick<AnalyzerFilters, "view" | "page">,
  pageSize: number,
): { items: TableItem[]; rowIndexes: number[] } {
  if (filters.view === "cells") {
    const rowIndexes = slicePage(sorted, filters.page, pageSize);
    return { items: rowIndexes.map((index): TableItem => ({ kind: "row", index })), rowIndexes };
  }

  const { grouped, rowsByStation } = groupByStation(sorted, facts);
  const rowIndexes = slicePage(grouped, filters.page, pageSize);
  const items: TableItem[] = [];
  let headedStationId: number | null = null;

  for (const index of rowIndexes) {
    const stationId = facts[index].stationId;
    if (stationId !== null && stationId !== headedStationId) {
      items.push({ kind: "station", stationId, rowIndexes: rowsByStation.get(stationId) ?? [] });
      headedStationId = stationId;
    }
    items.push({ kind: "row", index });
  }
  return { items, rowIndexes };
}

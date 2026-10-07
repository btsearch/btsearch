import type { Band, CellMatchResult, OfficialSiteRef, Station } from "@openbts/shared/contract";

import type { AnalyzerSession } from "../data/session";
import { isChangeKind } from "../model/filters";
import type { AnalyzerLookups, LogRow, MatchTables, RowFacts } from "../model/types";
import type { TableItem } from "../model/views";
import type { MapOperator } from "@/features/map/data/mapLookups";

export type StationView = {
  station: Station;
  operator: MapOperator | undefined;
  regionName: string | null;
};

export type RowView = {
  index: number;
  row: LogRow;
  result: CellMatchResult | null;
  facts: RowFacts;
  operator: MapOperator | undefined;
  band: Band | undefined;
  stationView: StationView | null;
  officialSites: OfficialSiteRef[];
};

type ItemView =
  | { kind: "row"; key: string; view: RowView }
  | { kind: "station"; key: string; stationView: StationView; rowIndexes: readonly number[]; differenceCount: number };

type RowViewSource = {
  session: Pick<AnalyzerSession, "rows" | "results" | "tables">;
  facts: readonly RowFacts[];
  lookups: AnalyzerLookups | null;
};

export type RowOpeners = {
  openStation: (station: Station) => void;
  openOfficialSite: (site: OfficialSiteRef) => void;
};

function findOperator(operatorId: number | null, lookups: AnalyzerLookups | null): MapOperator | undefined {
  return operatorId === null ? undefined : lookups?.operatorsById.get(operatorId);
}

function listOfficialSites(result: CellMatchResult | null, tables: MatchTables): OfficialSiteRef[] {
  const sites: OfficialSiteRef[] = [];

  for (const siteId of result?.officialSiteIds ?? []) {
    const site = tables.officialSitesById.get(siteId);
    if (site !== undefined) sites.push(site);
  }
  return sites;
}

function buildStationView(stationId: number | null, source: RowViewSource): StationView | null {
  const station = stationId === null ? undefined : source.session.tables.stationsById.get(stationId);
  if (station === undefined) return null;

  const regionId = station.location?.regionId;
  return {
    station,
    operator: findOperator(station.operatorId, source.lookups),
    regionName: regionId === undefined ? null : (source.lookups?.regionsById.get(regionId)?.name ?? null),
  };
}

function buildRowView(index: number, source: RowViewSource): RowView {
  const { session, lookups } = source;
  const facts = source.facts[index];
  const result = session.results?.[index] ?? null;

  return {
    index,
    row: session.rows[index],
    result,
    facts,
    operator: findOperator(facts.operatorId, lookups),
    band: facts.bandId === null ? undefined : lookups?.bandsById.get(facts.bandId),
    stationView: buildStationView(facts.stationId, source),
    officialSites: listOfficialSites(result, session.tables),
  };
}

function countDifferences(rowIndexes: readonly number[], facts: readonly RowFacts[]): number {
  let differenceCount = 0;
  for (const index of rowIndexes) differenceCount += facts[index].kinds.filter(isChangeKind).length;
  return differenceCount;
}

export function listItemViews(items: readonly TableItem[], source: RowViewSource): ItemView[] {
  const itemViews: ItemView[] = [];

  for (const item of items) {
    if (item.kind === "row") {
      itemViews.push({ kind: "row", key: `row-${item.index}`, view: buildRowView(item.index, source) });
      continue;
    }

    const stationView = buildStationView(item.stationId, source);
    if (stationView === null) continue;

    const { rowIndexes } = item;
    const differenceCount = countDifferences(rowIndexes, source.facts);
    itemViews.push({ kind: "station", key: `station-${item.stationId}`, stationView, rowIndexes, differenceCount });
  }
  return itemViews;
}

import type { Sector, Station } from "@openbts/shared/contract";

import { type BatchRow, type BatchStation, isBandMissing } from "./batchRows";
import { type BuiltStation, type SendMode, buildStationEntries, buildSubmissionItems } from "./bodies";
import { type RowConflict, findConflicts } from "./conflicts";
import { hasRowChanges, selectBatchRow } from "./fieldSelection";
import { type BatchReview, hasRemovals, isRowActive } from "./reviewState";
import { type TacSpread, planTacSpread } from "./tacSpread";

export type StationRead = { status: "ready"; station: Station } | { status: "gone" };
export type StationPlace = { countryCode: string | null; regionId: number | null };

type BatchViewInput = {
  stations: readonly BatchStation[];
  review: BatchReview;
  reads: ReadonlyMap<number, StationRead>;
  operatorCountryCodes: ReadonlyMap<number, string>;
  closedCountryCodes: ReadonlySet<string>;
  canApplyAt: ((place: StationPlace) => boolean) | null;
};

export type BatchProblem =
  | { kind: "conflict"; stationId: number; rowIndex: number; conflict: RowConflict }
  | { kind: "bandMissing"; stationId: number; rowIndex: number }
  | { kind: "stationGone"; stationId: number; rowIndex: null };

export type StationView = BatchStation & {
  sourceRows: readonly BatchRow[];
  removedRows: ReadonlySet<number>;
  isRemoved: boolean;
  activeRows: BatchRow[];
  keptRowCount: number;
  changeCount: number;
  conflicts: ReadonlyMap<number, RowConflict>;
  spread: TacSpread | null;
  sectorsById: ReadonlyMap<number, Sector>;
  countryCode: string | null;
  isGone: boolean;
  isOutsideArea: boolean;
  isCountryClosed: boolean;
};

export type BatchView = {
  stations: StationView[];
  stationCount: number;
  changeCount: number;
  countryCount: number;
  hasRemovals: boolean;
  problems: BatchProblem[];
  submit: { stations: BuiltStation[]; itemCount: number; leftOutConfirmCount: number; isCountryClosed: boolean };
  apply: { stations: BuiltStation[]; isOutsideArea: boolean };
};

type StationFacts = Pick<
  StationView,
  "rows" | "removedRows" | "isRemoved" | "activeRows" | "keptRowCount" | "countryCode" | "isGone" | "isOutsideArea" | "isCountryClosed"
>;
type KnownStationView = { record: Station | null; view: StationView };

const NO_SECTORS: ReadonlyMap<number, Sector> = new Map();
const NO_NOTE = "";
const knownViews = new WeakMap<BatchStation, KnownStationView>();

function getCountryCode({ station }: BatchStation, operatorCountryCodes: ReadonlyMap<number, string>): string | null {
  if (station.place !== null) return station.place.countryCode;
  return station.operatorId === null ? null : (operatorCountryCodes.get(station.operatorId) ?? null);
}

function hasSameFacts(view: StationView, facts: StationFacts): boolean {
  return (
    view.isRemoved === facts.isRemoved &&
    view.keptRowCount === facts.keptRowCount &&
    view.countryCode === facts.countryCode &&
    view.isGone === facts.isGone &&
    view.isOutsideArea === facts.isOutsideArea &&
    view.isCountryClosed === facts.isCountryClosed &&
    view.rows.length === facts.rows.length &&
    view.rows.every((row, position) => row === facts.rows[position]) &&
    view.removedRows.size === facts.removedRows.size &&
    [...view.removedRows].every((index) => facts.removedRows.has(index)) &&
    view.activeRows.length === facts.activeRows.length &&
    view.activeRows.every((row, position) => row === facts.activeRows[position])
  );
}

function toStationView(entry: BatchStation, input: BatchViewInput): StationView {
  const { station } = entry;
  const { review } = input;
  const rows = entry.rows.map((row) => selectBatchRow(row, review.excludedFields.get(row.index)));
  const read = input.reads.get(station.id);
  const record = read !== undefined && read.status === "ready" ? read.station : null;
  const countryCode = getCountryCode(entry, input.operatorCountryCodes);
  const place: StationPlace = { countryCode, regionId: station.place === null ? null : station.place.regionId };
  const facts: StationFacts = {
    rows,
    removedRows: new Set(rows.filter((row) => review.removedRows.has(row.index)).map((row) => row.index)),
    isRemoved: review.removedStations.has(station.id),
    activeRows: rows.filter((row) => isRowActive(review, row) && hasRowChanges(row)),
    keptRowCount: rows.filter((row) => !review.removedRows.has(row.index)).length,
    countryCode,
    isGone: read !== undefined && read.status === "gone",
    isOutsideArea: input.canApplyAt !== null && !input.canApplyAt(place),
    isCountryClosed: countryCode !== null && input.closedCountryCodes.has(countryCode),
  };
  const known = knownViews.get(entry);
  if (known !== undefined && known.record === record && hasSameFacts(known.view, facts)) return known.view;

  const { activeRows } = facts;
  const spread = record === null ? null : planTacSpread(activeRows, record.cells ?? []);
  const view: StationView = {
    ...facts,
    station,
    sourceRows: entry.rows,
    changeCount: activeRows.length + (spread === null ? 0 : spread.cellIds.length),
    conflicts: findConflicts(activeRows),
    spread,
    sectorsById: record === null ? NO_SECTORS : new Map((record.sectors ?? []).map((sector) => [sector.id, sector])),
  };

  knownViews.set(entry, { record, view });
  return view;
}

function listStationProblems(view: StationView): BatchProblem[] {
  const stationId = view.station.id;
  const problems: BatchProblem[] = view.isGone ? [{ kind: "stationGone", stationId, rowIndex: null }] : [];

  for (const row of view.activeRows) {
    const conflict = view.conflicts.get(row.index);
    if (conflict !== undefined) problems.push({ kind: "conflict", stationId, rowIndex: row.index, conflict });
    if (isBandMissing(row)) problems.push({ kind: "bandMissing", stationId, rowIndex: row.index });
  }
  return problems;
}

function buildStations(views: readonly StationView[], mode: SendMode): BuiltStation[] {
  return views.flatMap((view) => buildStationEntries(view.station.id, view.activeRows, mode, view.spread) ?? []);
}

export function buildBatchView(input: BatchViewInput): BatchView {
  const { review } = input;
  const stations = input.stations.map((entry) => toStationView(entry, input));
  const activeStations = stations.filter((view) => view.activeRows.length > 0);
  const submitStations = buildStations(activeStations, "submit");
  const applyStations = buildStations(activeStations, "apply");
  const submittedIds = new Set(submitStations.map((built) => built.stationId));
  const countryCodes = new Set(stations.flatMap((view) => (view.countryCode === null ? [] : [view.countryCode])));

  return {
    stations,
    stationCount: activeStations.length,
    changeCount: activeStations.reduce((total, view) => total + view.changeCount, 0),
    countryCount: countryCodes.size,
    hasRemovals: hasRemovals(review),
    problems: activeStations.flatMap(listStationProblems),
    submit: {
      stations: submitStations,
      itemCount: buildSubmissionItems(submitStations, NO_NOTE).items.length,
      leftOutConfirmCount: activeStations.reduce((total, view) => total + view.activeRows.filter((row) => row.action === "confirm").length, 0),
      isCountryClosed: activeStations.some((view) => view.isCountryClosed && submittedIds.has(view.station.id)),
    },
    apply: {
      stations: applyStations,
      isOutsideArea: activeStations.some((view) => view.isOutsideArea),
    },
  };
}

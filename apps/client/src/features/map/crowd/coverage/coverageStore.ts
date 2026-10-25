import { useEffect, useSyncExternalStore } from "react";

export type MeasuredCoverageSector = { label: string; azimuth: number | null };

type MeasuredCoveragePlace = {
  operatorId: number | null;
  title: string;
  latitude: number;
  longitude: number;
};

export type MeasuredCoverageTarget =
  | (MeasuredCoveragePlace & { kind: "estimatedSite"; observedSiteIds: readonly number[] })
  | (MeasuredCoveragePlace & {
      kind: "station";
      stationId: number;
      countryCode: string | null;
      sectorsByCellId: ReadonlyMap<number, MeasuredCoverageSector>;
    });

export type StationCoverageTarget = Extract<MeasuredCoverageTarget, { kind: "station" }>;

export type MeasuredCoverageBandId = number | null;

export type MeasuredCoverage = {
  target: MeasuredCoverageTarget;
  bandId: MeasuredCoverageBandId | undefined;
  observedCellId: number | null;
  colorBySinr: boolean;
};

export type StationCoverageRequest = Pick<MeasuredCoverage, "bandId" | "observedCellId"> & { stationId: number };

type CoverageChoice = Partial<Pick<MeasuredCoverage, "bandId" | "observedCellId">>;

const listeners = new Set<() => void>();
let current: MeasuredCoverage | null = null;
let hostCount = 0;
let stationRequest: StationCoverageRequest | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function publish(next: MeasuredCoverage | null): void {
  if (next === current) return;
  current = next;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changeCoverage(change: Partial<Omit<MeasuredCoverage, "target">>): void {
  if (current !== null) publish({ ...current, ...change });
}

function isSameCoverageTarget(left: MeasuredCoverageTarget, right: MeasuredCoverageTarget): boolean {
  if (left.kind === "station") return right.kind === "station" && left.stationId === right.stationId;
  if (right.kind === "station") return false;
  return left.observedSiteIds.length === right.observedSiteIds.length && left.observedSiteIds.every((id) => right.observedSiteIds.includes(id));
}

export function showMeasuredCoverage(target: MeasuredCoverageTarget, choice: CoverageChoice = {}): void {
  if (hostCount === 0) return;
  const shown = current !== null && isSameCoverageTarget(current.target, target) ? current : null;
  let bandId = shown?.bandId;
  if (choice.bandId !== undefined) bandId = choice.bandId;

  publish({
    target,
    bandId,
    observedCellId: choice.observedCellId ?? shown?.observedCellId ?? null,
    colorBySinr: shown?.colorBySinr ?? false,
  });
}

export function hideMeasuredCoverage(): void {
  publish(null);
}

export function chooseMeasuredCoverageBand(bandId: MeasuredCoverageBandId): void {
  changeCoverage({ bandId, observedCellId: null, colorBySinr: false });
}

export function chooseMeasuredCoverageCell(observedCellId: number | null): void {
  changeCoverage(observedCellId === null ? { observedCellId, colorBySinr: false } : { observedCellId });
}

export function colorMeasuredCoverageBySinr(colorBySinr: boolean): void {
  changeCoverage({ colorBySinr });
}

export function requestStationCoverage(request: StationCoverageRequest): void {
  stationRequest = request;
}

export function showRequestedStationCoverage(target: StationCoverageTarget): boolean {
  const request = stationRequest;
  if (request?.stationId !== target.stationId) return false;
  stationRequest = null;
  showMeasuredCoverage(target, { bandId: request.bandId, observedCellId: request.observedCellId });
  return true;
}

export function useMeasuredCoverage(): MeasuredCoverage | null {
  return useSyncExternalStore(subscribe, () => current);
}

export function useIsMeasuredCoverageShown(): boolean {
  return useSyncExternalStore(subscribe, () => current !== null);
}

export function useIsMeasuredCoverageShownFor(target: MeasuredCoverageTarget): boolean {
  return useSyncExternalStore(subscribe, () => current !== null && isSameCoverageTarget(current.target, target));
}

export function useFocusedCoverageTarget(): MeasuredCoverageTarget | null {
  return useSyncExternalStore(subscribe, () => (current === null || current.observedCellId === null ? null : current.target));
}

export function useCanShowMeasuredCoverage(): boolean {
  return useSyncExternalStore(subscribe, () => hostCount > 0);
}

export function useMeasuredCoverageHost(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;
    hostCount += 1;
    notify();
    return () => {
      hostCount -= 1;
      if (hostCount === 0) {
        current = null;
        stationRequest = null;
      }
      notify();
    };
  }, [isActive]);
}

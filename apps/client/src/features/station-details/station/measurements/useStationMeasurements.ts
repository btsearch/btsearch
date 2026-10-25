import { useQuery } from "@tanstack/react-query";

import type { StationRecord } from "../types";
import { indexSectorInfo } from "../utils/sectors";
import { getStationCountryCode } from "../utils/stations";
import { indexMeasuredCells, toStationCoverageTarget } from "./measuredCells";
import { isObservationCountryPrivate } from "@/features/map/crowd/access/countryPrivacy";
import { useCrowdAccess } from "@/features/map/crowd/access/useCrowdAccess";
import { observedCellsQueryOptions } from "@/features/map/crowd/api/observedQueries";
import type { StationCoverageTarget } from "@/features/map/crowd/coverage/coverageStore";
import { type MeasuredCoverageBand, type MeasuredCoverageCell, listCoverageBands } from "@/features/map/crowd/coverage/coverageView";
import { bandsQueryOptions, countriesQueryOptions } from "@/features/shared/lookups";
import { hasFailedLoad } from "@/lib/queryLoadState";

type StationMeasurementsState = "unavailable" | "loading" | "failed" | "ready";

export type StationMeasurements = {
  state: StationMeasurementsState;
  target: StationCoverageTarget | null;
  bands: MeasuredCoverageBand[];
  cellsById: ReadonlyMap<number, MeasuredCoverageCell>;
  isSwitchedOff: boolean;
  isCountryPrivate: boolean;
  isRetrying: boolean;
  retry: () => void;
};

const NO_BANDS: MeasuredCoverageBand[] = [];

function readState(isAvailable: boolean, isFailed: boolean, isReady: boolean): StationMeasurementsState {
  if (!isAvailable) return "unavailable";
  if (isFailed) return "failed";
  return isReady ? "ready" : "loading";
}

export function useStationMeasurements(station: StationRecord): StationMeasurements {
  const access = useCrowdAccess();
  const isMeasured = station.sightings !== null && station.sightings !== undefined;
  const isAvailable = isMeasured && access.isAvailable;
  const cellsQuery = useQuery(observedCellsQueryOptions(isAvailable ? { kind: "station", stationId: station.id } : null));
  const { data: bandList } = useQuery({ ...bandsQueryOptions(), enabled: isAvailable });
  const { data: countries } = useQuery({ ...countriesQueryOptions(), enabled: isAvailable && !access.isAdmin });

  const records = cellsQuery.data;
  const target = toStationCoverageTarget(station, indexSectorInfo(station.sectors));
  const bandsById = bandList === undefined ? undefined : new Map(bandList.map((band) => [band.id, band]));
  const bands = target === null || records === undefined || bandsById === undefined ? NO_BANDS : listCoverageBands(records, target, bandsById);

  return {
    state: readState(isAvailable, hasFailedLoad(cellsQuery), records !== undefined && bandsById !== undefined),
    target,
    bands,
    cellsById: indexMeasuredCells(bands),
    isSwitchedOff: access.isSwitchedOff,
    isCountryPrivate: !access.isAdmin && isObservationCountryPrivate(countries, getStationCountryCode(station)),
    isRetrying: cellsQuery.isError && cellsQuery.isFetching,
    retry: () => void cellsQuery.refetch(),
  };
}

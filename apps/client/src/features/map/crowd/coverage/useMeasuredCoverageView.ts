import type { Band } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { type ObservedCellsScope, observedCellsQueryOptions } from "../api/observedQueries";
import type { MeasuredCoverage, MeasuredCoverageTarget } from "./coverageStore";
import { type MeasuredCoverageBand, type MeasuredCoverageView, listCoverageBands, readCoverageView } from "./coverageView";

const NO_BANDS: MeasuredCoverageBand[] = [];

function toCellsScope(target: MeasuredCoverageTarget): ObservedCellsScope {
  return target.kind === "station" ? { kind: "station", stationId: target.stationId } : { kind: "sites", observedSiteIds: target.observedSiteIds };
}

export function useMeasuredCoverageView(coverage: MeasuredCoverage | null, bandsById: ReadonlyMap<number, Band> | undefined) {
  const target = coverage?.target ?? null;
  const query = useQuery(observedCellsQueryOptions(target === null ? null : toCellsScope(target)));
  const records = query.data;

  const bands = useMemo(() => {
    if (target === null || records === undefined || bandsById === undefined) return NO_BANDS;
    return listCoverageBands(records, target, bandsById);
  }, [target, records, bandsById]);

  const view: MeasuredCoverageView | null =
    coverage === null || records === undefined || bandsById === undefined ? null : readCoverageView(bands, coverage);

  return {
    view,
    isLoading: coverage !== null && (query.isPending || bandsById === undefined),
    isError: query.isError,
    isRetrying: query.isError && query.isFetching,
    retry: () => void query.refetch(),
  };
}

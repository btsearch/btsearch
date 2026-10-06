import { useQueries } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { findRowOperatorId } from "../model/rows";
import type { AnalyzerLookups, LogRow, MatchResults } from "../model/types";
import { bandPlanQueryOptions } from "@/features/admin/reference/api/bandPlan";
import { type MapLookups, useMapLookups } from "@/features/map/data/mapLookups";
import { type QueryLoadState, hasFailedLoad } from "@/lib/queryLoadState";

type BandPlan = { countryCode: string; bandIds: readonly number[] };

type BandPlanQuery = QueryLoadState & {
  data: number[] | undefined;
  refetch: () => unknown;
};

type BandPlanAnswers = {
  plans: BandPlan[];
  hasFailed: boolean;
  isRetrying: boolean;
  refetchFailedPlans: BandPlanQuery["refetch"][];
};

type SharedAnalyzerLookups = {
  plans: readonly BandPlan[];
  lookups: AnalyzerLookups;
};

type AnalyzerLookupsState = {
  lookups: AnalyzerLookups | null;
  mapLookups: MapLookups | undefined;
  hasFailed: boolean;
  hasFailedPlans: boolean;
  isRetrying: boolean;
  retry: () => void;
};

const operatorIdsByLookups = new WeakMap<MapLookups, ReadonlyMap<string, number>>();
const analyzerLookupsByMapLookups = new WeakMap<MapLookups, SharedAnalyzerLookups>();

function buildOperatorIdByPlmn(mapLookups: MapLookups): ReadonlyMap<string, number> {
  const operatorIdByPlmn = new Map<string, number>();

  for (const operator of mapLookups.operators) {
    if (operator.primaryPlmn !== null && !operatorIdByPlmn.has(operator.primaryPlmn)) operatorIdByPlmn.set(operator.primaryPlmn, operator.id);
  }
  for (const operator of mapLookups.operators) {
    for (const entry of operator.plmns) if (!operatorIdByPlmn.has(entry.plmn)) operatorIdByPlmn.set(entry.plmn, operator.id);
  }
  return operatorIdByPlmn;
}

function getOperatorIdByPlmn(mapLookups: MapLookups): ReadonlyMap<string, number> {
  const known = operatorIdsByLookups.get(mapLookups);
  if (known !== undefined) return known;

  const operatorIdByPlmn = buildOperatorIdByPlmn(mapLookups);
  operatorIdsByLookups.set(mapLookups, operatorIdByPlmn);
  return operatorIdByPlmn;
}

function buildAnalyzerLookups(mapLookups: MapLookups, plans: readonly BandPlan[]): AnalyzerLookups {
  return {
    operatorsById: mapLookups.operatorsById,
    operatorGroups: mapLookups.operatorGroups,
    operatorIdByPlmn: getOperatorIdByPlmn(mapLookups),
    bands: mapLookups.bands,
    bandsById: mapLookups.bandsById,
    regionsById: mapLookups.regionsById,
    planBandIdsByCountry: new Map(plans.map((plan) => [plan.countryCode, new Set(plan.bandIds)])),
  };
}

function isSamePlan(plan: BandPlan, other: BandPlan | undefined): boolean {
  return other !== undefined && plan.countryCode === other.countryCode && plan.bandIds === other.bandIds;
}

function hasSamePlans(plans: readonly BandPlan[], others: readonly BandPlan[]): boolean {
  return plans.length === others.length && plans.every((plan, index) => isSamePlan(plan, others[index]));
}

function getSharedAnalyzerLookups(mapLookups: MapLookups, plans: readonly BandPlan[]): AnalyzerLookups {
  const known = analyzerLookupsByMapLookups.get(mapLookups);
  if (known !== undefined && hasSamePlans(known.plans, plans)) return known.lookups;

  const lookups = buildAnalyzerLookups(mapLookups, plans);
  analyzerLookupsByMapLookups.set(mapLookups, { plans, lookups });
  return lookups;
}

export function listSessionCountryCodes(mapLookups: MapLookups | undefined, rows: readonly LogRow[], results: MatchResults | null): string[] {
  if (mapLookups === undefined) return [];

  const operatorIdByPlmn = getOperatorIdByPlmn(mapLookups);
  const countryCodes = new Set<string>();

  for (const [position, row] of rows.entries()) {
    const operatorId = findRowOperatorId(row, results?.[position] ?? null, operatorIdByPlmn);
    const countryCode = operatorId === null ? undefined : mapLookups.operatorsById.get(operatorId)?.operator.countryCode;
    if (countryCode !== undefined) countryCodes.add(countryCode);
  }
  return [...countryCodes].sort();
}

function collectBandPlans(countryCodes: readonly string[], planQueries: readonly BandPlanQuery[]): BandPlanAnswers {
  const failedQueries = planQueries.filter(hasFailedLoad);

  function toPlan(planQuery: BandPlanQuery, index: number): BandPlan[] {
    return planQuery.data === undefined ? [] : [{ countryCode: countryCodes[index], bandIds: planQuery.data }];
  }

  return {
    plans: planQueries.flatMap(toPlan),
    hasFailed: failedQueries.length > 0,
    isRetrying: failedQueries.some((planQuery) => planQuery.isFetching),
    refetchFailedPlans: failedQueries.map((planQuery) => planQuery.refetch),
  };
}

export function useAnalyzerLookups(countryCodes: readonly string[]): AnalyzerLookupsState {
  const { lookups: mapLookups, isError, isRetrying, retry: retryMapLookups } = useMapLookups();
  const {
    plans,
    hasFailed: hasFailedPlans,
    isRetrying: isRetryingPlans,
    refetchFailedPlans,
  } = useQueries({
    queries: countryCodes.map((countryCode) => bandPlanQueryOptions(countryCode)),
    combine: (planQueries) => collectBandPlans(countryCodes, planQueries),
  });

  const lookups = useMemo(() => (mapLookups === undefined ? null : getSharedAnalyzerLookups(mapLookups, plans)), [mapLookups, plans]);

  function retryFailedLoads() {
    retryMapLookups();
    for (const refetchPlan of refetchFailedPlans) void refetchPlan();
  }

  const latestRetry = useRef(retryFailedLoads);

  useLayoutEffect(() => {
    latestRetry.current = retryFailedLoads;
  });

  const retry = useCallback(() => latestRetry.current(), []);

  return { lookups, mapLookups, hasFailed: isError, hasFailedPlans, isRetrying: isRetrying || isRetryingPlans, retry };
}

import { useQuery } from "@tanstack/react-query";

import { indexHistoryNames } from "./names";
import type { HistoryNames } from "./names";
import { bandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";

export function useHistoryNames(): HistoryNames {
  const { data: operators } = useQuery(operatorsQueryOptions());
  const { data: bands } = useQuery(bandsQueryOptions());
  const { data: regions } = useQuery(regionsQueryOptions());

  return indexHistoryNames(operators, bands, regions);
}

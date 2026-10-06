import { useSettings } from "./useSettings";

type FeatureFlag = "submissions" | "lists";

export function useFeatureGate(flag: FeatureFlag) {
  const { data: settings, isError, isFetching, errorUpdateCount, refetch } = useSettings();

  return {
    hasLoadError: settings === undefined && (isError || (isFetching && errorUpdateCount > 0)),
    isDisabled: settings !== undefined && !settings.features[flag],
    isRetrying: isFetching,
    retry: refetch,
  };
}

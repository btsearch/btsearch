import { useSettings } from "./useSettings";

type FeatureFlag = "submissionsEnabled" | "enableUserLists";

export function useFeatureGate(flag: FeatureFlag) {
  const { data: settings, isError, isFetching, errorUpdateCount, refetch } = useSettings();

  return {
    hasLoadError: settings === undefined && (isError || (isFetching && errorUpdateCount > 0)),
    isDisabled: settings !== undefined && !settings?.[flag],
    isRetrying: isFetching,
    retry: refetch,
  };
}

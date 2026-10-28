import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import type { MapFilters } from "./mapFilters";
import { type MapFiltersScope, readSavedMapFilters } from "./mapFilterStorage";
import {
  type CloudPreferences,
  type CloudPreferencesPatch,
  type PreferenceProfile,
  cloudPreferencesQueryOptions,
  flushQueuedCloudPatch,
  getCloudPreferencesQueryKey,
  patchCloudPreferences,
  queueCloudPatch,
  useActivePreferenceProfile,
  useCloudPreferencesUserId,
} from "@/hooks/usePreferences";

const CLOUD_MAP_FILTER_KEYS: Record<PreferenceProfile, "mapFiltersDesktop" | "mapFiltersMobile"> = {
  desktop: "mapFiltersDesktop",
  mobile: "mapFiltersMobile",
};

function isMapFiltersSyncEnabled(preferences: CloudPreferences | undefined): boolean {
  return preferences?.syncEnabled === true && preferences.syncMapFilters === true;
}

export function useCloudMapFilters(scope: MapFiltersScope) {
  const queryClient = useQueryClient();
  const userId = useCloudPreferencesUserId();
  const syncedUserId = scope === "map" ? userId : undefined;
  const activeProfile = useActivePreferenceProfile();

  const { data: cloudFilters } = useQuery({
    ...cloudPreferencesQueryOptions(syncedUserId),
    select: (preferences) => (isMapFiltersSyncEnabled(preferences) ? (preferences[CLOUD_MAP_FILTER_KEYS[activeProfile]] ?? null) : null),
  });

  const { mutate: patchCloud } = useMutation({
    mutationFn: patchCloudPreferences,
    onSuccess: (updated) => {
      if (syncedUserId !== undefined) queryClient.setQueryData(getCloudPreferencesQueryKey(syncedUserId), updated);
    },
  });

  const queueFilters = useCallback(
    (filters: MapFilters) => {
      if (syncedUserId === undefined) return;
      const preferences = queryClient.getQueryData<CloudPreferences>(getCloudPreferencesQueryKey(syncedUserId));
      if (!isMapFiltersSyncEnabled(preferences)) return;
      const patch: CloudPreferencesPatch = { [CLOUD_MAP_FILTER_KEYS[activeProfile]]: filters };
      queueCloudPatch(syncedUserId, patch, patchCloud);
    },
    [activeProfile, patchCloud, queryClient, syncedUserId],
  );

  useEffect(() => {
    if (syncedUserId === undefined) return undefined;
    return () => flushQueuedCloudPatch(syncedUserId);
  }, [syncedUserId]);

  return { cloudFilters: cloudFilters ?? null, queueFilters };
}

export function useMapFiltersSyncSetting() {
  const queryClient = useQueryClient();
  const userId = useCloudPreferencesUserId();
  const activeProfile = useActivePreferenceProfile();

  const { data: isEnabled = false } = useQuery({
    ...cloudPreferencesQueryOptions(userId),
    select: (preferences) => preferences.syncMapFilters === true,
  });

  const { mutateAsync: patchCloudAsync, isPending: isUpdating } = useMutation({ mutationFn: patchCloudPreferences });

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (userId === undefined) return;
      const patch: CloudPreferencesPatch = enabled
        ? { syncMapFilters: true, [CLOUD_MAP_FILTER_KEYS[activeProfile]]: readSavedMapFilters("map").filters }
        : { syncMapFilters: false };
      const updated = await patchCloudAsync(patch);
      queryClient.setQueryData(getCloudPreferencesQueryKey(userId), updated);
    },
    [activeProfile, patchCloudAsync, queryClient, userId],
  );

  return { isEnabled, isUpdating, setEnabled };
}

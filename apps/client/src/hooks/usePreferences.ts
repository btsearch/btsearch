import type { CLFDescriptionTemplates } from "@openbts/shared/clfExportTemplates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/authClient";

import { useDebouncedCallback } from "./useDebouncedCallback";

export type GpsFormat = "decimal" | "dms";
export type NavigationApp = "google-maps" | "apple-maps" | "waze" | "osmand" | "openstreetmap";
export type NavLinksDisplay = "inline" | "buttons";
export type MapPointStyle = "dots" | "markers";
export type CartoVariant = "auto" | "dark" | "light";
export type PreferenceProfile = "desktop" | "mobile";
export type NavMode = "sidebar" | "floating";

export interface UserPreferences {
  navMode: NavMode;
  gpsFormat: GpsFormat;
  navigationApps: NavigationApp[];
  navLinksDisplay: NavLinksDisplay;
  radiolinesMinZoom: number;
  mapStationsLimit: number;
  mapRadiolinesLimit: number;
  showMapHoverTooltip: boolean;
  mapPointStyle: MapPointStyle;
  mapRightClickMeasure: boolean;
  mapMeasureCircle: boolean;
  showStationPhotoPanel: boolean;
  showElevation: boolean;
  showAzimuths: boolean;
  hideFiltersOnMapClick: boolean;
  azimuthsMinZoom: number;
  azimuthLineLength: number;
  azimuthSpread: number;
  cartoVariant: CartoVariant;
  CLFDescriptionTemplates: CLFDescriptionTemplates;
}

export type CloudPreferences = {
  syncEnabled: boolean;
  desktop: Partial<UserPreferences> | null;
  mobile: Partial<UserPreferences> | null;
  favoriteLists?: string[];
};

export type CloudPreferencesPatch = {
  syncEnabled?: boolean;
  desktop?: Partial<UserPreferences> | null;
  mobile?: Partial<UserPreferences> | null;
  favoriteLists?: string[];
};

const LEGACY_STORAGE_KEY = "user-preferences";
const DESKTOP_STORAGE_KEY = "user-preferences:desktop";
const MOBILE_STORAGE_KEY = "user-preferences:mobile";
const PROFILE_OVERRIDE_KEY = "user-preferences:profile-override";
const MOBILE_WIDTH = 768;
const DEFAULT_PROFILE: PreferenceProfile = "desktop";
const STORAGE_KEYS_THAT_INVALIDATE_SNAPSHOT = new Set([LEGACY_STORAGE_KEY, DESKTOP_STORAGE_KEY, MOBILE_STORAGE_KEY, PROFILE_OVERRIDE_KEY]);

const DEFAULT_PREFERENCES: UserPreferences = {
  navMode: "sidebar",
  gpsFormat: "decimal",
  navigationApps: ["google-maps"],
  navLinksDisplay: "inline",
  radiolinesMinZoom: 8,
  mapStationsLimit: 1000,
  mapRadiolinesLimit: 500,
  showMapHoverTooltip: false,
  mapPointStyle: "dots",
  mapRightClickMeasure: false,
  mapMeasureCircle: false,
  showStationPhotoPanel: true,
  showElevation: false,
  showAzimuths: false,
  hideFiltersOnMapClick: false,
  azimuthsMinZoom: 14,
  azimuthLineLength: 200,
  azimuthSpread: 60,
  cartoVariant: "light",
  CLFDescriptionTemplates: {},
};

const listeners = new Set<() => void>();
let cachedSnapshot: UserPreferences | null = null;
let cachedRaw: string | null = null;
let cachedProfile: PreferenceProfile | null = null;
let isStorageListenerActive = false;

export function getCloudPreferencesQueryKey(userId: string) {
  return ["account-preferences", userId] as const;
}

function getProfileStorageKey(profile: PreferenceProfile) {
  return profile === "desktop" ? DESKTOP_STORAGE_KEY : MOBILE_STORAGE_KEY;
}

function readStorageValue(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageValue(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

function readProfileRawWithLegacyFallback(profile: PreferenceProfile): string | null {
  const profileStorageKey = getProfileStorageKey(profile);
  const profileRaw = readStorageValue(profileStorageKey);
  if (profileRaw !== null) return profileRaw;

  const legacyRaw = readStorageValue(LEGACY_STORAGE_KEY);
  if (legacyRaw === null) return null;

  if (writeStorageValue(profileStorageKey, legacyRaw)) removeStorageValue(LEGACY_STORAGE_KEY);
  return legacyRaw;
}

function parsePreferences(raw: string | null): UserPreferences {
  if (raw === null) return DEFAULT_PREFERENCES;

  try {
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<UserPreferences>) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function invalidateSnapshot() {
  cachedSnapshot = null;
  cachedRaw = null;
  cachedProfile = null;
  emitChange();
}

function handleStorageChange(event: StorageEvent) {
  if (event.key !== null && !STORAGE_KEYS_THAT_INVALIDATE_SNAPSHOT.has(event.key)) return;
  invalidateSnapshot();
}

function resolveProfile(): PreferenceProfile {
  const override = readStorageValue(PROFILE_OVERRIDE_KEY);
  if (override === "desktop" || override === "mobile") return override;
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  return window.innerWidth < MOBILE_WIDTH ? "mobile" : "desktop";
}

function handleResize() {
  const profile = resolveProfile();
  if (cachedProfile !== null && profile === cachedProfile) return;
  invalidateSnapshot();
}

function getSnapshot(): UserPreferences {
  const profile = resolveProfile();
  const stored = readProfileRawWithLegacyFallback(profile);

  if (profile === cachedProfile && stored === cachedRaw && cachedSnapshot !== null) return cachedSnapshot;

  cachedProfile = profile;
  cachedRaw = stored;
  cachedSnapshot = parsePreferences(stored);
  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!isStorageListenerActive && typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("resize", handleResize);
    isStorageListenerActive = true;
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && isStorageListenerActive && typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("resize", handleResize);
      isStorageListenerActive = false;
    }
  };
}

function replacePreferencesForProfile(profile: PreferenceProfile, preferences: Partial<UserPreferences>) {
  const next = { ...DEFAULT_PREFERENCES, ...preferences };
  const nextRaw = JSON.stringify(next);
  if (readStorageValue(getProfileStorageKey(profile)) === nextRaw) return;

  writeStorageValue(getProfileStorageKey(profile), nextRaw);
  if (profile === resolveProfile()) {
    cachedProfile = profile;
    cachedRaw = nextRaw;
    cachedSnapshot = next;
    emitChange();
  }
}

function setPreferences(update: Partial<UserPreferences>): UserPreferences | null {
  const profile = resolveProfile();
  const current = getSnapshot();
  const next = { ...current, ...update };
  const nextRaw = JSON.stringify(next);
  const stored = readProfileRawWithLegacyFallback(profile);
  const currentRaw = stored ?? JSON.stringify(current);

  if (nextRaw === currentRaw) return null;

  writeStorageValue(getProfileStorageKey(profile), nextRaw);
  cachedProfile = profile;
  cachedSnapshot = next;
  cachedRaw = nextRaw;
  emitChange();
  return next;
}

function setProfileOverride(profile: PreferenceProfile) {
  writeStorageValue(PROFILE_OVERRIDE_KEY, profile);
  invalidateSnapshot();
}

export async function patchCloudPreferences(patch: CloudPreferencesPatch): Promise<CloudPreferences> {
  const response = await fetchJson<{ data: CloudPreferences }>(`${API_BASE}/account/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return response.data;
}

export function usePreferences() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const preferences = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFERENCES);
  const activeProfile = useSyncExternalStore<PreferenceProfile>(subscribe, resolveProfile, () => DEFAULT_PROFILE);

  const queryKey = userId === undefined ? null : getCloudPreferencesQueryKey(userId);
  const { data: cloudPreferences, isFetching: isCloudPreferencesLoading } = useQuery({
    queryKey: queryKey ?? ["account-preferences", "anonymous"],
    queryFn: () => fetchApiData<CloudPreferences>("account/preferences"),
    enabled: userId !== undefined,
  });

  const {
    mutate: patchCloud,
    mutateAsync: patchCloudAsync,
    isPending: isCloudPreferencesUpdating,
  } = useMutation({
    mutationFn: patchCloudPreferences,
    onSuccess: (updated) => {
      if (queryKey === null) return;
      queryClient.setQueryData(queryKey, updated);
    },
  });

  const syncEnabled = userId !== undefined && cloudPreferences?.syncEnabled === true;
  const activeCloudPreferences = syncEnabled ? (cloudPreferences?.[activeProfile] ?? null) : null;

  useEffect(() => {
    if (activeCloudPreferences === null) return;
    replacePreferencesForProfile(activeProfile, activeCloudPreferences);
  }, [activeCloudPreferences, activeProfile]);

  const debouncedPatchCloud = useDebouncedCallback((profile: PreferenceProfile, nextPreferences: UserPreferences) => {
    patchCloud(profile === "desktop" ? { desktop: nextPreferences } : { mobile: nextPreferences });
  }, 500);

  const updatePreferences = useCallback(
    (update: Partial<UserPreferences>) => {
      const next = setPreferences(update);
      if (next === null || !syncEnabled) return;
      debouncedPatchCloud(activeProfile, next);
    },
    [activeProfile, debouncedPatchCloud, syncEnabled],
  );

  const enableSync = useCallback(async () => {
    if (userId === undefined) return;

    const current = parsePreferences(readProfileRawWithLegacyFallback(activeProfile));
    const updated = await patchCloudAsync({
      syncEnabled: true,
      ...(activeProfile === "desktop" ? { desktop: current } : { mobile: current }),
    });
    queryClient.setQueryData(getCloudPreferencesQueryKey(userId), updated);
  }, [activeProfile, patchCloudAsync, queryClient, userId]);

  const disableSync = useCallback(async () => {
    if (userId === undefined) return;

    const updated = await patchCloudAsync({ syncEnabled: false });
    queryClient.setQueryData(getCloudPreferencesQueryKey(userId), updated);
  }, [patchCloudAsync, queryClient, userId]);

  return {
    preferences,
    updatePreferences,
    cloud: {
      activeProfile,
      disableSync,
      enableSync,
      isAuthenticated: userId !== undefined,
      isLoading: isCloudPreferencesLoading,
      isUpdating: isCloudPreferencesUpdating,
      setActiveProfile: setProfileOverride,
      syncEnabled,
    },
  };
}

export function getPreferences(): UserPreferences {
  return getSnapshot();
}

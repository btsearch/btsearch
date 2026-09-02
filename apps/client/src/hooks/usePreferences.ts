import {
  type CLFDescriptionTemplates,
  CLF_DESCRIPTION_TEMPLATE_RATS,
  type ClfExportFormat,
  normalizeCLFDescriptionTemplates,
} from "@openbts/shared/clfExportTemplates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { API_BASE, fetchApiData, fetchJson } from "@/lib/api";
import { authClient } from "@/lib/authClient";

export type GpsFormat = "decimal" | "dms";
export type NavigationApp = "google-maps" | "apple-maps" | "waze" | "osmand" | "organic-maps" | "openstreetmap";
export type NavLinksDisplay = "inline" | "buttons";
export type MapPointStyle = "dots" | "markers";
export type CartoVariant = "auto" | "dark" | "light";
export type PreferenceProfile = "desktop" | "mobile";
export type NavMode = "sidebar" | "floating";
export type CLFExportFormat = ClfExportFormat;
export type clfExportFilters = {
  operators: number[];
  regions: string[];
  bands: number[];
  format: CLFExportFormat;
  displayNRSeparately: boolean;
};

export interface UserPreferences {
  navMode: NavMode;
  gpsFormat: GpsFormat;
  navigationApps: NavigationApp[];
  navLinksDisplay: NavLinksDisplay;
  radiolinesMinZoom: number;
  mapStationsLimit: number;
  mapRadiolinesLimit: number;
  showMapHoverTooltip: boolean;
  allowMultipleMapPopups: boolean;
  closeMapPopupsOnMapClick: boolean;
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
  clfDescriptionTemplates: CLFDescriptionTemplates;
  clfExportFilters: clfExportFilters;
}

export type CloudPreferences = {
  syncEnabled: boolean;
  desktop: Partial<UserPreferences> | null;
  mobile: Partial<UserPreferences> | null;
  clfDescriptionTemplates: CLFDescriptionTemplates | null;
  favoriteLists?: string[];
};

export type CloudPreferencesPatch = {
  syncEnabled?: boolean;
  desktop?: Partial<UserPreferences> | null;
  mobile?: Partial<UserPreferences> | null;
  clfDescriptionTemplates?: CLFDescriptionTemplates | null;
  favoriteLists?: string[];
};

const LEGACY_STORAGE_KEY = "user-preferences";
const DESKTOP_STORAGE_KEY = "user-preferences:desktop";
const MOBILE_STORAGE_KEY = "user-preferences:mobile";
const pendingCloudPatches = new Map<
  string,
  {
    patch: CloudPreferencesPatch;
    send: (patch: CloudPreferencesPatch) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
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
  allowMultipleMapPopups: true,
  closeMapPopupsOnMapClick: false,
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
  clfDescriptionTemplates: {},
  clfExportFilters: {
    operators: [],
    regions: [],
    bands: [],
    format: "4.0",
    displayNRSeparately: false,
  },
};

const MOBILE_DEFAULT_PREFERENCES: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  navMode: "floating",
  allowMultipleMapPopups: false,
};

const listeners = new Set<() => void>();
let cachedSnapshot: UserPreferences | null = null;
let cachedRaw: string | null = null;
let cachedProfile: PreferenceProfile | null = null;
let isStorageListenerActive = false;

export function getCloudPreferencesQueryKey(userId: string) {
  return ["account-preferences", userId] as const;
}

function flushQueuedCloudPatch(userId: string) {
  const pendingPatch = pendingCloudPatches.get(userId);
  if (pendingPatch === undefined) return;

  pendingCloudPatches.delete(userId);
  pendingPatch.send(pendingPatch.patch);
}

function queueCloudPatch(userId: string, patch: CloudPreferencesPatch, send: (patch: CloudPreferencesPatch) => void) {
  const pendingPatch = pendingCloudPatches.get(userId);
  if (pendingPatch !== undefined) {
    clearTimeout(pendingPatch.timer);
    pendingPatch.patch = { ...pendingPatch.patch, ...patch };
    pendingPatch.send = send;
    pendingPatch.timer = setTimeout(() => flushQueuedCloudPatch(userId), 500);
    return;
  }

  pendingCloudPatches.set(userId, {
    patch,
    send,
    timer: setTimeout(() => flushQueuedCloudPatch(userId), 500),
  });
}

export function areCLFDescriptionTemplatesEqual(left: CLFDescriptionTemplates, right: CLFDescriptionTemplates) {
  return CLF_DESCRIPTION_TEMPLATE_RATS.every((rat) => left[rat] === right[rat]);
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

function getDefaultPreferences(profile: PreferenceProfile): UserPreferences {
  return profile === "mobile" ? MOBILE_DEFAULT_PREFERENCES : DEFAULT_PREFERENCES;
}

function mergePreferences(profile: PreferenceProfile, preferences: Partial<UserPreferences>): UserPreferences {
  return {
    ...getDefaultPreferences(profile),
    ...preferences,
    ...(profile === "mobile" ? { hideFiltersOnMapClick: false } : {}),
  };
}

function parsePreferences(raw: string | null, profile: PreferenceProfile): UserPreferences {
  const defaults = getDefaultPreferences(profile);
  if (raw === null) return defaults;

  try {
    const { CLFDescriptionTemplates: legacyTemplates, ...preferences } = JSON.parse(raw) as Partial<UserPreferences> & {
      CLFDescriptionTemplates?: CLFDescriptionTemplates;
    };
    const next = mergePreferences(profile, {
      ...preferences,
      ...(preferences.clfDescriptionTemplates === undefined && legacyTemplates !== undefined ? { clfDescriptionTemplates: legacyTemplates } : {}),
    });

    if (legacyTemplates !== undefined) writeStorageValue(getProfileStorageKey(profile), JSON.stringify(next));

    return next;
  } catch {
    return defaults;
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

function getProfileSnapshot(): PreferenceProfile {
  if (cachedProfile !== null) return cachedProfile;
  cachedProfile = resolveProfile();
  return cachedProfile;
}

function getSnapshot(): UserPreferences {
  if (cachedSnapshot !== null) return cachedSnapshot;

  const profile = getProfileSnapshot();
  cachedRaw = readProfileRawWithLegacyFallback(profile);
  cachedSnapshot = parsePreferences(cachedRaw, profile);
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
  const current = parsePreferences(readProfileRawWithLegacyFallback(profile), profile);
  const next = mergePreferences(profile, { ...current, ...preferences });
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

type PreferencesUpdate = Partial<UserPreferences> | ((current: UserPreferences) => Partial<UserPreferences>);

function setPreferences(update: PreferencesUpdate): UserPreferences | null {
  const profile = resolveProfile();
  const current = getSnapshot();
  const patch = typeof update === "function" ? update(current) : update;
  const next = mergePreferences(profile, { ...current, ...patch });
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

function getCloudProfilePreferences(preferences: UserPreferences): Omit<UserPreferences, "clfDescriptionTemplates"> {
  const { clfDescriptionTemplates: _templates, ...cloudPreferences } = preferences;
  return cloudPreferences;
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
  const activeProfile = useSyncExternalStore<PreferenceProfile>(subscribe, getProfileSnapshot, () => DEFAULT_PROFILE);

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
  const clfDescriptionTemplates = syncEnabled ? (cloudPreferences?.clfDescriptionTemplates ?? null) : null;

  const queueCurrentUserCloudPatch = useCallback(
    (patch: CloudPreferencesPatch) => {
      if (userId === undefined) return;
      queueCloudPatch(userId, patch, patchCloud);
    },
    [patchCloud, userId],
  );

  useEffect(() => {
    if (activeCloudPreferences === null) return;
    replacePreferencesForProfile(activeProfile, activeCloudPreferences);
  }, [activeCloudPreferences, activeProfile]);

  useEffect(() => {
    if (clfDescriptionTemplates === null) return;
    setPreferences({ clfDescriptionTemplates });
  }, [clfDescriptionTemplates]);

  useEffect(() => {
    if (userId === undefined) return undefined;
    return () => flushQueuedCloudPatch(userId);
  }, [userId]);

  const updatePreferences = useCallback(
    (update: PreferencesUpdate) => {
      const next = setPreferences(update);
      if (next === null || !syncEnabled) return;
      const cloudPreferences = getCloudProfilePreferences(next);
      queueCurrentUserCloudPatch(activeProfile === "desktop" ? { desktop: cloudPreferences } : { mobile: cloudPreferences });
    },
    [activeProfile, queueCurrentUserCloudPatch, syncEnabled],
  );

  const updateClfDescriptionTemplates = useCallback(
    (templates: CLFDescriptionTemplates) => {
      const normalizedTemplates = normalizeCLFDescriptionTemplates(templates);
      setPreferences({ clfDescriptionTemplates: normalizedTemplates });
      if (!syncEnabled) return;
      const currentTemplates = clfDescriptionTemplates ?? preferences.clfDescriptionTemplates;
      if (areCLFDescriptionTemplatesEqual(currentTemplates, normalizedTemplates)) return;
      queueCurrentUserCloudPatch({ clfDescriptionTemplates: normalizedTemplates });
    },
    [clfDescriptionTemplates, preferences.clfDescriptionTemplates, queueCurrentUserCloudPatch, syncEnabled],
  );

  const enableSync = useCallback(async () => {
    if (userId === undefined) return;

    const current = parsePreferences(readProfileRawWithLegacyFallback(activeProfile), activeProfile);
    const { clfDescriptionTemplates: templates, ...profilePreferences } = current;
    const hasExistingCloudTemplates = cloudPreferences?.clfDescriptionTemplates !== null && cloudPreferences?.clfDescriptionTemplates !== undefined;
    const updated = await patchCloudAsync({
      syncEnabled: true,
      ...(activeProfile === "desktop" ? { desktop: profilePreferences } : { mobile: profilePreferences }),
      ...(hasExistingCloudTemplates ? {} : { clfDescriptionTemplates: templates }),
    });
    queryClient.setQueryData(getCloudPreferencesQueryKey(userId), updated);
  }, [activeProfile, cloudPreferences, patchCloudAsync, queryClient, userId]);

  const disableSync = useCallback(async () => {
    if (userId === undefined) return;

    const updated = await patchCloudAsync({ syncEnabled: false });
    queryClient.setQueryData(getCloudPreferencesQueryKey(userId), updated);
  }, [patchCloudAsync, queryClient, userId]);

  return {
    preferences,
    updatePreferences,
    clfDescriptionTemplates: clfDescriptionTemplates ?? preferences.clfDescriptionTemplates,
    updateClfDescriptionTemplates,
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

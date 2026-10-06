import type { Settings, SettingsAccess, SettingsAnnouncement, SettingsFeatures, SettingsUpdate } from "@openbts/shared/contract";

export type RouteListName = keyof SettingsAccess;
export type SwitchedFeature = Exclude<keyof SettingsFeatures, "psc" | "bsic">;

const HIDDEN_ANNOUNCEMENT: SettingsAnnouncement = { isEnabled: false, type: "info", message: "" };

export function readAnnouncement(settings: Settings): SettingsAnnouncement {
  return settings.announcement ?? HIDDEN_ANNOUNCEMENT;
}

export function toFeatureUpdate(feature: SwitchedFeature, isEnabled: boolean): SettingsUpdate {
  const features: Partial<SettingsFeatures> = {};
  features[feature] = isEnabled;
  return { features };
}

export function toRouteListUpdate(list: RouteListName, entries: string[]): SettingsUpdate {
  if (list === "openRoutes") return { access: { openRoutes: entries } };
  return { access: { disabledRoutes: entries } };
}

export function applySettingsUpdate(settings: Settings, update: SettingsUpdate): Settings {
  return {
    ...settings,
    isSignInRequired: update.isSignInRequired ?? settings.isSignInRequired,
    features: { ...settings.features, ...update.features },
    announcement: update.announcement ? { ...readAnnouncement(settings), ...update.announcement } : settings.announcement,
    access: settings.access && update.access ? { ...settings.access, ...update.access } : settings.access,
  };
}

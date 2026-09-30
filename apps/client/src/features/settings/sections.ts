export const SETTINGS_SECTION_KEYS = ["account", "profile", "security", "apps", "preferences"] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number];

export const SETTINGS_SECTION_IDS: Record<SettingsSectionKey, string> = {
  account: "settings-account",
  profile: "settings-profile",
  security: "settings-security",
  apps: "settings-apps",
  preferences: "settings-preferences",
};

export function isSettingsSectionKey(value: unknown): value is SettingsSectionKey {
  return SETTINGS_SECTION_KEYS.some((key) => key === value);
}

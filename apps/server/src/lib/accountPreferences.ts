import type { CloudPreferences, CloudUserPreferences } from "@openbts/drizzle";
import { CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH, CLF_DESCRIPTION_TEMPLATE_RATS, CLF_EXPORT_FORMATS } from "@openbts/shared/clfExportTemplates";
import { MAX_LOCATION_LIST_LIMIT, countryCodeSchema } from "@openbts/shared/contract";
import { z } from "zod/v4";

export const MAX_CLOUD_PREFERENCES_BYTES = 262_144;

const CLFDescriptionTemplatesSchema = z.looseObject(
  Object.fromEntries(CLF_DESCRIPTION_TEMPLATE_RATS.map((rat) => [rat, z.string().max(CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH).optional()])),
);
const clfExportFiltersSchema = z
  .object({
    operators: z.array(z.number()),
    countryCode: countryCodeSchema.optional(),
    operatorIds: z.array(z.number().int().positive()).optional(),
    regions: z.array(z.string().min(1).max(3)),
    bands: z.array(z.number()),
    format: z.enum(CLF_EXPORT_FORMATS),
    displayNRSeparately: z.boolean().default(false),
  })
  .loose();

export const userPreferencesSchema = z
  .object({
    navMode: z.enum(["sidebar", "floating"]),
    gpsFormat: z.enum(["decimal", "dms"]),
    navigationApps: z.array(z.enum(["google-maps", "apple-maps", "waze", "osmand", "organic-maps", "openstreetmap"])),
    navLinksDisplay: z.enum(["inline", "buttons"]),
    radiolinesMinZoom: z.number().min(7).max(11),
    mapStationsLimit: z.number().min(10).max(MAX_LOCATION_LIST_LIMIT),
    mapRadiolinesLimit: z.number().min(10).max(1000),
    showMapHoverTooltip: z.boolean(),
    allowMultipleMapPopups: z.boolean(),
    closeMapPopupsOnMapClick: z.boolean(),
    mapPointStyle: z.enum(["dots", "markers"]),
    mapRightClickMeasure: z.boolean(),
    mapMeasureCircle: z.boolean(),
    showStationPhotoPanel: z.boolean(),
    showElevation: z.boolean(),
    showAzimuths: z.boolean(),
    hideFiltersOnMapClick: z.boolean(),
    azimuthsMinZoom: z.number().min(10).max(19),
    azimuthLineLength: z.number().min(50).max(3000),
    azimuthSpread: z.number().min(0).max(120),
    cartoVariant: z.enum(["auto", "dark", "light"]),
    clfExportFilters: clfExportFiltersSchema,
  })
  .loose()
  .partial();

export const cloudPreferencesSchema = z.looseObject({
  syncEnabled: z.boolean(),
  desktop: userPreferencesSchema.nullable(),
  mobile: userPreferencesSchema.nullable(),
  clfDescriptionTemplates: CLFDescriptionTemplatesSchema.nullable(),
  favoriteLists: z.array(z.string()).optional(),
});

export const cloudPreferencesPatchSchema = z.looseObject({
  syncEnabled: z.boolean().optional(),
  desktop: userPreferencesSchema.nullable().optional(),
  mobile: userPreferencesSchema.nullable().optional(),
  clfDescriptionTemplates: CLFDescriptionTemplatesSchema.nullable().optional(),
  favoriteLists: z.array(z.string()).optional(),
});

export const DEFAULT_CLOUD_PREFERENCES: CloudPreferences = {
  syncEnabled: false,
  desktop: null,
  mobile: null,
  clfDescriptionTemplates: null,
  favoriteLists: [],
};

const knownPreferences: Record<string, z.ZodType> = userPreferencesSchema.shape;

function normalizeCloudUserPreferences(value: CloudPreferences["desktop"] | undefined): CloudUserPreferences | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value).flatMap(([key, stored]): [string, unknown][] => {
    if (key === "__proto__") return [];
    if (!Object.hasOwn(knownPreferences, key)) return [[key, stored]];

    const parsed = knownPreferences[key]?.safeParse(stored);
    return parsed?.success ? [[key, parsed.data]] : [];
  });
  return Object.fromEntries(entries) as CloudUserPreferences;
}

export function normalizeCloudPreferences(value: CloudPreferences | null | undefined): CloudPreferences {
  if (value === undefined || value === null) return DEFAULT_CLOUD_PREFERENCES;

  const favoriteLists = Array.isArray(value.favoriteLists) ? value.favoriteLists.filter((id) => typeof id === "string") : [];
  const templates = CLFDescriptionTemplatesSchema.safeParse(value.clfDescriptionTemplates);

  return {
    ...value,
    syncEnabled: value.syncEnabled === true,
    desktop: normalizeCloudUserPreferences(value.desktop),
    mobile: normalizeCloudUserPreferences(value.mobile),
    clfDescriptionTemplates: templates.success ? (templates.data as CloudPreferences["clfDescriptionTemplates"]) : null,
    favoriteLists,
  };
}

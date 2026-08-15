import type { CloudPreferences } from "@openbts/drizzle";
import { CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH, CLF_DESCRIPTION_TEMPLATE_RATS, CLF_EXPORT_FORMATS } from "@openbts/shared/clfExportTemplates";
import { z } from "zod/v4";

const CLFDescriptionTemplateRatSchema = z.enum(CLF_DESCRIPTION_TEMPLATE_RATS);
const CLFDescriptionTemplatesSchema = z.partialRecord(CLFDescriptionTemplateRatSchema, z.string().max(CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH));
const clfExportFiltersSchema = z
  .object({
    operators: z.array(z.number()),
    regions: z.array(z.string().length(3)),
    bands: z.array(z.number()),
    format: z.enum(CLF_EXPORT_FORMATS),
    displayNRSeparately: z.boolean().default(false),
  })
  .strict();

export const userPreferencesSchema = z
  .object({
    navMode: z.enum(["sidebar", "floating"]),
    gpsFormat: z.enum(["decimal", "dms"]),
    navigationApps: z.array(z.enum(["google-maps", "apple-maps", "waze", "osmand", "organic-maps", "openstreetmap"])),
    navLinksDisplay: z.enum(["inline", "buttons"]),
    radiolinesMinZoom: z.number().min(7).max(11),
    mapStationsLimit: z.number().min(10).max(1000),
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
  .strict()
  .partial();

export const cloudPreferencesSchema = z.object({
  syncEnabled: z.boolean(),
  desktop: userPreferencesSchema.nullable(),
  mobile: userPreferencesSchema.nullable(),
  clfDescriptionTemplates: CLFDescriptionTemplatesSchema.nullable(),
  favoriteLists: z.array(z.string()).optional(),
});

export const cloudPreferencesPatchSchema = z
  .object({
    syncEnabled: z.boolean().optional(),
    desktop: userPreferencesSchema.nullable().optional(),
    mobile: userPreferencesSchema.nullable().optional(),
    clfDescriptionTemplates: CLFDescriptionTemplatesSchema.nullable().optional(),
    favoriteLists: z.array(z.string()).optional(),
  })
  .strict();

export const DEFAULT_CLOUD_PREFERENCES: CloudPreferences = {
  syncEnabled: false,
  desktop: null,
  mobile: null,
  clfDescriptionTemplates: null,
  favoriteLists: [],
};

function normalizeCloudUserPreferences(value: CloudPreferences["desktop"]) {
  if (value === null) return null;

  const { clfExportFilters, ...preferences } = value;
  const filters = clfExportFiltersSchema.safeParse(clfExportFilters).data;
  return {
    ...preferences,
    ...(filters === undefined ? {} : { clfExportFilters: filters }),
  };
}

export function normalizeCloudPreferences(value: CloudPreferences | null | undefined): CloudPreferences {
  if (value === undefined || value === null) return DEFAULT_CLOUD_PREFERENCES;

  const favoriteLists = Array.isArray(value.favoriteLists) ? value.favoriteLists.filter((id) => typeof id === "string") : [];

  return {
    syncEnabled: value.syncEnabled === true,
    desktop: normalizeCloudUserPreferences(value.desktop ?? null),
    mobile: normalizeCloudUserPreferences(value.mobile ?? null),
    clfDescriptionTemplates: value.clfDescriptionTemplates ?? null,
    favoriteLists,
  };
}

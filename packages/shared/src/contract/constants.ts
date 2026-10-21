import type { CLFDescriptionTemplateRat } from "../clfExportTemplates.ts";

export const MAX_LATITUDE = 90;
export const MAX_LONGITUDE = 180;

export const BAND_RATS = ["gsm", "umts", "lte", "nr"] as const;
export type BandRat = (typeof BAND_RATS)[number];

export const UNKNOWN_BAND = "unknown";

export const CELL_RATS = ["gsm", "umts", "lte", "nr"] as const;
export type CellRat = (typeof CELL_RATS)[number];

export const GNBID_MIN_LENGTH = 22;
export const GNBID_MAX_LENGTH = 32;
export const DEFAULT_GNBID_LENGTH = 24;

export const CELL_EXPORT_TEMPLATE_PARAMS = {
  GSM: "templateGsm",
  UMTS: "templateUmts",
  LTE: "templateLte",
  NR_NSA: "templateNrNsa",
  NR: "templateNr",
} as const satisfies Record<CLFDescriptionTemplateRat, string>;

export const COMMENT_MAX_LENGTH = 1000;

export const HUNTER_REGIONS_MAX = 20;

export const BACKHAUL_MEDIUMS = ["fiber", "microwave", "satellite", "xdsl"] as const;
export type BackhaulMedium = (typeof BACKHAUL_MEDIUMS)[number];

export const MAX_LOCATION_LIST_LIMIT = 1500;

export const MAX_MICROWAVE_LINK_LIST_LIMIT = 1000;

export const OFFICIAL_RAT_FILTERS = ["gsm", "gsmR", "umts", "lte", "nr", "cdma", "iot"] as const;
export type OfficialRatFilter = (typeof OFFICIAL_RAT_FILTERS)[number];

export const OFFICIAL_SITE_INCLUDES = ["location", "location.region", "permits", "permits.sectors"] as const;
export type OfficialSiteInclude = (typeof OFFICIAL_SITE_INCLUDES)[number];

export const IMPORT_SLICE_OUTCOMES = ["applied", "unchanged", "held"] as const;
export type ImportSliceOutcome = (typeof IMPORT_SLICE_OUTCOMES)[number];

export const IMPORT_RUN_STEPS = [
  "unlistedPermits",
  "siteNotifications",
  "links",
  "stationNotifications",
  "orphans",
  "statistics",
  "push",
  "kmz",
  "publish",
  "prune",
] as const;
export type ImportRunStepName = (typeof IMPORT_RUN_STEPS)[number];

export const IMPORT_CHANGE_KINDS = [
  "siteAdded",
  "siteMoved",
  "siteRemapped",
  "permitAdded",
  "permitListed",
  "permitUnlisted",
  "permitArchived",
  "stationLinked",
  "stationUnlinked",
  "microwaveLinkAdded",
  "microwaveLinkRenewed",
  "microwaveLinkArchived",
] as const;
export type ImportChangeKind = (typeof IMPORT_CHANGE_KINDS)[number];

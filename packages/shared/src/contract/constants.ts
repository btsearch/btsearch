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

export const OFFICIAL_PERMIT_STATUSES = ["inService", "approved"] as const;
export type OfficialPermitStatus = (typeof OFFICIAL_PERMIT_STATUSES)[number];

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
  "permitMovedIn",
  "permitMovedOut",
  "stationLinked",
  "stationUnlinked",
  "microwaveLinkAdded",
  "microwaveLinkRenewed",
  "microwaveLinkArchived",
] as const;
export type ImportChangeKind = (typeof IMPORT_CHANGE_KINDS)[number];

export const CELL_MATCHES_FOUND = ["cell", "cellByLac", "station"] as const;
export const CELL_NETWORK_MATCHES = ["own", "extraCode", "partner", "missingCode"] as const;
export type CellNetworkMatch = (typeof CELL_NETWORK_MATCHES)[number];

export const MEASUREMENT_READER_SOURCES = ["api", "modemLog", "modemPoll"] as const;

export const MEASUREMENT_UPLOAD_STATUSES = ["received", "processing", "processed", "rejected", "withdrawn", "excluded"] as const;
export type MeasurementUploadStatus = (typeof MEASUREMENT_UPLOAD_STATUSES)[number];

export const MEASUREMENT_DROP_REASONS = [
  "mockLocation",
  "poorAccuracy",
  "implausibleFix",
  "noPosition",
  "badTime",
  "tooOld",
  "duplicate",
  "implausible",
  "closedCountry",
  "readingBlock",
  "noLevel",
  "noIdentity",
] as const;

export const ATTESTATION_SECURITY_LEVELS = ["software", "trustedEnvironment", "strongBox"] as const;
export const VERIFIED_BOOT_STATES = ["verified", "selfSigned", "unverified", "failed"] as const;

export const MEASUREMENT_MODEM_FAMILIES = ["qualcomm", "samsung", "mediatek", "unisoc", "hisilicon", "other"] as const;
export type MeasurementModemFamily = (typeof MEASUREMENT_MODEM_FAMILIES)[number];

export const READING_BLOCK_ROLES = ["serving", "neighbour", "nsa"] as const;
export const READING_BLOCK_FIELDS = ["pci", "channel", "areaCode", "bandwidth", "timingAdvance", "signal"] as const;
export const READING_BLOCK_MODES = ["drop", "corroborate"] as const;

export const ENGINE_RUN_KINDS = [
  "subtract",
  "restore",
  "refold",
  "rebuild",
  "reestimate",
  "recalibrate",
  "evaluate",
  "rebuildTrails",
  "rebuildReadModels",
] as const;
export type EngineRunKind = (typeof ENGINE_RUN_KINDS)[number];

export const ENGINE_RUN_OUTCOMES = ["done", "failed", "cancelled"] as const;

export const TIMING_ADVANCE_RATS = ["gsm", "lte", "nr"] as const satisfies readonly CellRat[];
export type TimingAdvanceRat = (typeof TIMING_ADVANCE_RATS)[number];

const SPEED_OF_LIGHT_M_PER_S = 299_792_458;
const GSM_SYMBOL_PERIOD_S = 48 / 13 / 1_000_000;
const LTE_BASIC_TIME_UNIT_S = 1 / (15_000 * 2_048);
const NR_BASIC_TIME_UNIT_S = 1 / (480_000 * 4_096);

export const TIMING_ADVANCE_STEP_METERS = {
  gsm: (SPEED_OF_LIGHT_M_PER_S * GSM_SYMBOL_PERIOD_S) / 2,
  lte: (SPEED_OF_LIGHT_M_PER_S * 16 * LTE_BASIC_TIME_UNIT_S) / 2,
  nr: (SPEED_OF_LIGHT_M_PER_S * 16 * 64 * NR_BASIC_TIME_UNIT_S) / 8 / 2,
} as const satisfies Record<TimingAdvanceRat, number>;

export const AREA_CLASSES = ["town", "suburb", "country"] as const;
export const EVIDENCE_CLASSES = [
  "littleTaOnePerson",
  "littleTaPeople",
  "coarseTaOnePerson",
  "coarseTaPeople",
  "muchTaOnePerson",
  "muchTaPeople",
] as const;
export const SNAP_CANDIDATE_KINDS = ["location", "officialSite", "officialSiteByIdentity", "observedSite", "candidate", "none"] as const;
export const EVALUATION_DIMENSIONS = ["all", "rat", "areaClass", "evidenceClass", "taGroup", "reader", "country"] as const;
export const STATION_HALVES = ["even", "odd"] as const;

export const OBSERVED_SITE_STATUSES = ["unmatched", "suggested", "matched", "ignored", "replaced"] as const;
export type ObservedSiteStatus = (typeof OBSERVED_SITE_STATUSES)[number];
export const OBSERVED_SITE_CONFIDENCE = 0.95;

export const OBSERVATION_FLAG_KINDS = [
  "cellMissing",
  "valueDiffers",
  "valueMissing",
  "networkMissing",
  "networkNotSeen",
  "bandNotInPlan",
  "readerQuirk",
  "deviceRevoked",
  "untrustedContributor",
  "unmatchedSite",
  "positionShifts",
  "suggestedSite",
  "positionDiffers",
  "renumbered",
  "bearingDiffers",
  "possiblyDecommissioned",
  "nodeSpansPlaces",
  "gnbLengthSuggestion",
  "siteIdKnown",
] as const;
export const OBSERVATION_FLAG_CLOSED_REASONS = ["applied", "fixedElsewhere", "evidenceGone", "dismissed"] as const;
export type ObservationFlagClosedReason = (typeof OBSERVATION_FLAG_CLOSED_REASONS)[number];
export const OBSERVATION_FLAG_DISMISSED_REASONS = ["notAnIssue", "cannotVerify", "needsSurvey"] as const;
export const VALUE_PATTERNS = ["bytesSwapped", "factor", "offset", "constant"] as const;

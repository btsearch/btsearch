import type { SearchKeyword } from "@openbts/shared/contract";

import type { FilterChoice, FilterKeyword } from "./types";
import { RAT_ORDER } from "@/features/shared/rat";

export { RAT_ORDER };

export const SOURCE_ID = "stations-source";
export const POINT_LAYER_ID = "stations-layer";

export const POLAND_CENTER: [number, number] = [19.9, 52.0];
export const POLAND_BOUNDS: [[number, number], [number, number]] = [
  [14.0, 48.9],
  [24.2, 55.8],
];
export const FLOATING_NAV_MAP_OFFSET_CLASS = "[--floating-nav-map-offset:calc(0.75rem+var(--floating-nav-bottom-padding,0.5rem))]";

export const PICKER_SOURCE_ID = "picker-locations-source";
export const PICKER_CIRCLE_LAYER_ID = "picker-locations-circle";
export const PICKER_SYMBOL_LAYER_ID = "picker-locations-symbol";
export const PICKER_LAYER_IDS = [PICKER_CIRCLE_LAYER_ID, PICKER_SYMBOL_LAYER_ID] as const;

export const PICKER_NEARBY_RADIUS_METERS = 100;

export const PICKER_REGISTER_SOURCE_ID = "picker-register-locations-source";
export const PICKER_REGISTER_CIRCLE_LAYER_ID = "picker-register-locations-circle";
export const PICKER_REGISTER_SYMBOL_LAYER_ID = "picker-register-locations-symbol";
export const PICKER_REGISTER_LAYER_IDS = [PICKER_REGISTER_CIRCLE_LAYER_ID, PICKER_REGISTER_SYMBOL_LAYER_ID] as const;

export const INTERNAL_AZIMUTHS_SOURCE_ID = "internal-azimuths-source";
export const INTERNAL_AZIMUTHS_FILL_LAYER_ID = "internal-azimuths-fill-layer";
export const INTERNAL_AZIMUTHS_OUTLINE_SOURCE_ID = "internal-azimuths-outline-source";
export const INTERNAL_AZIMUTHS_OUTLINE_LAYER_ID = "internal-azimuths-outline-layer";
export const INTERNAL_AZIMUTHS_LABEL_SOURCE_ID = "internal-azimuths-label-source";
export const INTERNAL_AZIMUTHS_LABEL_LAYER_ID = "internal-azimuths-label-layer";
export const OFFICIAL_AZIMUTHS_SOURCE_ID = "official-azimuths-source";
export const OFFICIAL_AZIMUTHS_FILL_LAYER_ID = "official-azimuths-fill-layer";
export const OFFICIAL_AZIMUTHS_OUTLINE_SOURCE_ID = "official-azimuths-outline-source";
export const OFFICIAL_AZIMUTHS_OUTLINE_LAYER_ID = "official-azimuths-outline-layer";
export const OFFICIAL_AZIMUTHS_LABEL_SOURCE_ID = "official-azimuths-label-source";
export const OFFICIAL_AZIMUTHS_LABEL_LAYER_ID = "official-azimuths-label-layer";

export const MICROWAVE_LINKS_SOURCE_ID = "radiolines-source";
export const MICROWAVE_LINKS_ENDPOINTS_SOURCE_ID = "radiolines-endpoints-source";
export const MICROWAVE_LINKS_LINE_LAYER_ID = "radiolines-layer";
export const MICROWAVE_LINKS_HITBOX_LAYER_ID = "radiolines-hitbox";
export const MICROWAVE_LINKS_ENDPOINT_LAYER_ID = "radiolines-endpoints";

export const PLANNED_PEM_SOURCE_ID = "planned-pem-source";
export const PLANNED_PEM_LAYER_ID = "planned-pem-layer";

export const ESTIMATED_SITES_SOURCE_ID = "estimated-sites-source";
export const ESTIMATED_SITES_LAYER_ID = "estimated-sites-layer";
export const ESTIMATED_SITE_AREA_SOURCE_ID = "estimated-site-area-source";
export const ESTIMATED_SITE_AREA_FILL_LAYER_ID = "estimated-site-area-fill";
export const ESTIMATED_SITE_AREA_LINE_LAYER_ID = "estimated-site-area-line";
export const TRAILS_SOURCE_ID = "trails-source";
export const TRAILS_LAYER_ID = "trails-layer";
export const MY_TRAILS_SOURCE_ID = "my-trails-source";
export const MY_TRAILS_LAYER_ID = "my-trails-layer";
export const COVERAGE_SOURCE_ID = "coverage-source";
export const COVERAGE_LAYER_ID = "coverage-layer";
export const COVERAGE_SHAPES_SOURCE_ID = "coverage-shapes-source";
export const COVERAGE_WEDGE_LAYER_ID = "coverage-wedge-layer";
export const COVERAGE_FOOTPRINT_FILL_LAYER_ID = "coverage-footprint-fill-layer";
export const COVERAGE_FOOTPRINT_LINE_LAYER_ID = "coverage-footprint-line-layer";
export const COVERAGE_HANDED_OVER_LAYER_ID = "coverage-handed-over-layer";
export const COVERAGE_FADED_LAYER_ID = "coverage-faded-layer";
export const COVERAGE_OTHER_LAYER_LAYER_ID = "coverage-other-layer-layer";

export const RAT_OPTIONS = [
  { value: "NR", label: "NR", gen: "5G" },
  { value: "LTE", label: "LTE", gen: "4G" },
  { value: "UMTS", label: "UMTS", gen: "3G" },
  { value: "GSM", label: "GSM", gen: "2G" },
  { value: "iot", label: "IoT", gen: "NB" },
] as const;

type KnownFilterKeyword = FilterKeyword & { key: `${SearchKeyword}:` };

const RAT_CHOICES: FilterChoice[] = [
  { value: "GSM", tag: "2G" },
  { value: "UMTS", tag: "3G" },
  { value: "LTE", tag: "4G" },
  { value: "NR", tag: "5G" },
];
const STATUS_CHOICES: FilterChoice[] = [
  { value: "published", labelKey: "stations:status.published", aliases: ["active"] },
  { value: "pending", labelKey: "stations:status.pending", aliases: ["awaitingcells"] },
  { value: "inactive", labelKey: "stations:status.inactive" },
];
const BACKHAUL_CHOICES: FilterChoice[] = [
  { value: "fiber", labelKey: "common:labels.backhaulFiber" },
  { value: "microwave", labelKey: "common:labels.backhaulMicrowave" },
  { value: "satellite", labelKey: "common:labels.backhaulSatellite" },
  { value: "xdsl", labelKey: "common:labels.backhaulXdsl", aliases: ["dsl"] },
];
const DUPLEX_CHOICES: FilterChoice[] = [{ value: "FDD" }, { value: "TDD" }, { value: "null", labelKey: "common:labels.unknown", aliases: ["false"] }];
const CELL_TYPE_CHOICES: FilterChoice[] = [
  { value: "macro", labelKey: "stations:cells.cellTypes.macrocell", aliases: ["macrocell"] },
  { value: "micro", labelKey: "stations:cells.cellTypes.microcell", aliases: ["microcell"] },
  { value: "pico", labelKey: "stations:cells.cellTypes.picocell", aliases: ["picocell"] },
  { value: "femto", labelKey: "stations:cells.cellTypes.femtocell", aliases: ["femtocell"] },
];

export const FILTER_KEYWORDS: KnownFilterKeyword[] = [
  { key: "bts_id:", descriptionKey: "btsId", group: "common", availableOn: ["map", "stations"], valueKind: "text" },
  { key: "plmn:", descriptionKey: "plmn", group: "common", availableOn: ["map"], valueKind: "operator", example: "26001" },
  { key: "city:", descriptionKey: "city", group: "common", availableOn: ["map", "stations"], valueKind: "text", example: "Kraków" },
  { key: "address:", descriptionKey: "address", group: "common", availableOn: ["map", "stations"], valueKind: "text" },
  { key: "rat:", descriptionKey: "rat", group: "common", availableOn: ["map"], valueKind: "choice", choices: RAT_CHOICES, example: "LTE, NR" },
  { key: "band:", descriptionKey: "band", group: "common", availableOn: ["map"], valueKind: "band", example: "800, 1800" },
  {
    key: "status:",
    descriptionKey: "status",
    group: "common",
    availableOn: ["stations"],
    valueKind: "choice",
    choices: STATUS_CHOICES,
    example: "published",
  },
  { key: "has_photo:", descriptionKey: "hasPhoto", group: "common", availableOn: ["map", "stations"], valueKind: "boolean", example: "true" },
  { key: "has_azimuth:", descriptionKey: "hasAzimuth", group: "common", availableOn: ["map", "stations"], valueKind: "boolean" },
  {
    key: "uplink:",
    descriptionKey: "uplink",
    group: "common",
    availableOn: ["map", "stations"],
    valueKind: "choice",
    choices: BACKHAUL_CHOICES,
    example: "fiber",
  },
  { key: "gps:", descriptionKey: "gps", group: "location", availableOn: ["map", "stations"], valueKind: "gps" },
  { key: "country:", descriptionKey: "country", group: "location", availableOn: ["map"], valueKind: "country" },
  { key: "region:", descriptionKey: "region", group: "location", availableOn: ["map"], valueKind: "region", example: "MAZ, SL" },
  { key: "duplex:", descriptionKey: "duplex", group: "cell", availableOn: ["map", "stations"], valueKind: "choice", choices: DUPLEX_CHOICES },
  { key: "is_confirmed:", descriptionKey: "isConfirmed", group: "cell", availableOn: ["map", "stations"], valueKind: "boolean" },
  { key: "cell_notes:", descriptionKey: "cellNotes", group: "cell", availableOn: ["map", "stations"], valueKind: "text" },
  { key: "cell_type:", descriptionKey: "cellType", group: "cell", availableOn: ["map", "stations"], valueKind: "choice", choices: CELL_TYPE_CHOICES },
  { key: "lac:", descriptionKey: "lac", group: "gsm", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "cid:", descriptionKey: "cid", group: "gsm", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "rnc:", descriptionKey: "rnc", group: "umts", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "umts_cid:", descriptionKey: "umtsCid", group: "umts", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "cid_long:", descriptionKey: "cidLong", group: "umts", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "umts_lac:", descriptionKey: "umtsLac", group: "umts", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "uarfcn:", descriptionKey: "uarfcn", group: "umts", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "enbid:", descriptionKey: "enbid", group: "lte", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "ecid:", descriptionKey: "ecid", group: "lte", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "lte_clid:", descriptionKey: "lteClid", group: "lte", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "tac:", descriptionKey: "tac", group: "lte", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "lte_pci:", descriptionKey: "ltePci", group: "lte", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "earfcn:", descriptionKey: "earfcn", group: "lte", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "supports_iot:", descriptionKey: "supportsIot", group: "lte", availableOn: ["map", "stations"], valueKind: "boolean" },
  { key: "gnbid:", descriptionKey: "gnbid", group: "nr", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "nci:", descriptionKey: "nci", group: "nr", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "nr_clid:", descriptionKey: "nrClid", group: "nr", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "nrtac:", descriptionKey: "nrtac", group: "nr", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "nr_pci:", descriptionKey: "nrPci", group: "nr", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "arfcn:", descriptionKey: "arfcn", group: "nr", availableOn: ["map", "stations"], valueKind: "number" },
  { key: "supports_nr_redcap:", descriptionKey: "supportsNrRedcap", group: "nr", availableOn: ["map", "stations"], valueKind: "boolean" },
  { key: "networks_id:", descriptionKey: "networksId", group: "identifiers", availableOn: ["map", "stations"], valueKind: "text" },
  { key: "networks_name:", descriptionKey: "networksName", group: "identifiers", availableOn: ["map", "stations"], valueKind: "text" },
  { key: "mno_name:", descriptionKey: "mnoName", group: "identifiers", availableOn: ["map", "stations"], valueKind: "text" },
  { key: "created_after:", descriptionKey: "createdAfter", group: "date", availableOn: ["map", "stations"], valueKind: "date" },
  { key: "created_before:", descriptionKey: "createdBefore", group: "date", availableOn: ["map", "stations"], valueKind: "date" },
  { key: "updated_after:", descriptionKey: "updatedAfter", group: "date", availableOn: ["map", "stations"], valueKind: "date" },
  { key: "updated_before:", descriptionKey: "updatedBefore", group: "date", availableOn: ["map", "stations"], valueKind: "date" },
];

export const FREQUENT_FILTER_KEYS: readonly string[] = ["rat:", "band:", "plmn:", "status:", "city:", "region:", "has_photo:", "uplink:"];
export const FREQUENT_FILTER_LIMIT = 6;

export const FILTER_REGEX =
  /(^|[\s,])(([a-z][a-z0-9_]*):\s*(?:'([^']*)'|"([^"]*)"|([^\s,'"][^\s,]*(?:,\s*(?![a-z][a-z0-9_]*:)[^\s,'"][^\s,]*)*)))(?:,(?=\s|$))?/gi;

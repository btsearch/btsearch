import { RAT_ORDER } from "@/features/shared/rat";

import type { FilterKeyword } from "./types";

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

export const PICKER_UKE_SOURCE_ID = "picker-uke-locations-source";
export const PICKER_UKE_CIRCLE_LAYER_ID = "picker-uke-locations-circle";
export const PICKER_UKE_SYMBOL_LAYER_ID = "picker-uke-locations-symbol";
export const PICKER_UKE_LAYER_IDS = [PICKER_UKE_CIRCLE_LAYER_ID, PICKER_UKE_SYMBOL_LAYER_ID] as const;

export const INTERNAL_AZIMUTHS_SOURCE_ID = "internal-azimuths-source";
export const INTERNAL_AZIMUTHS_FILL_LAYER_ID = "internal-azimuths-fill-layer";
export const INTERNAL_AZIMUTHS_OUTLINE_SOURCE_ID = "internal-azimuths-outline-source";
export const INTERNAL_AZIMUTHS_OUTLINE_LAYER_ID = "internal-azimuths-outline-layer";
export const INTERNAL_AZIMUTHS_LABEL_SOURCE_ID = "internal-azimuths-label-source";
export const INTERNAL_AZIMUTHS_LABEL_LAYER_ID = "internal-azimuths-label-layer";
export const UKE_AZIMUTHS_SOURCE_ID = "uke-azimuths-source";
export const UKE_AZIMUTHS_FILL_LAYER_ID = "uke-azimuths-fill-layer";
export const UKE_AZIMUTHS_OUTLINE_SOURCE_ID = "uke-azimuths-outline-source";
export const UKE_AZIMUTHS_OUTLINE_LAYER_ID = "uke-azimuths-outline-layer";
export const UKE_AZIMUTHS_LABEL_SOURCE_ID = "uke-azimuths-label-source";
export const UKE_AZIMUTHS_LABEL_LAYER_ID = "uke-azimuths-label-layer";

export const RADIOLINES_SOURCE_ID = "radiolines-source";
export const RADIOLINES_ENDPOINTS_SOURCE_ID = "radiolines-endpoints-source";
export const RADIOLINES_LINE_LAYER_ID = "radiolines-layer";
export const RADIOLINES_HITBOX_LAYER_ID = "radiolines-hitbox";
export const RADIOLINES_ENDPOINT_LAYER_ID = "radiolines-endpoints";

export const PLANNED_PEM_SOURCE_ID = "planned-pem-source";
export const PLANNED_PEM_LAYER_ID = "planned-pem-layer";

export const RAT_OPTIONS = [
  { value: "NR", label: "NR", gen: "5G" },
  { value: "LTE", label: "LTE", gen: "4G" },
  { value: "UMTS", label: "UMTS", gen: "3G" },
  { value: "GSM", label: "GSM", gen: "2G" },
  { value: "iot", label: "IoT", gen: "NB" },
] as const;
export const UKE_RAT_OPTIONS = [
  { value: "NR", label: "NR", gen: "5G" },
  { value: "LTE", label: "LTE", gen: "4G" },
  { value: "UMTS", label: "UMTS", gen: "3G" },
  { value: "CDMA", label: "CDMA", gen: "3G" },
  { value: "GSM", label: "GSM", gen: "2G" },
  { value: "GSM-R", label: "GSM-R", gen: "2G" },
  { value: "iot", label: "IoT", gen: "NB" },
] as const;

export const FILTER_KEYWORDS: FilterKeyword[] = [
  { key: "bts_id:", descriptionKey: "btsId", group: "common", availableOn: ["map", "stations"] },
  { key: "mnc:", descriptionKey: "mnc", group: "common", availableOn: ["map"] },
  { key: "city:", descriptionKey: "city", group: "common", availableOn: ["map", "stations"] },
  { key: "address:", descriptionKey: "address", group: "common", availableOn: ["map", "stations"] },
  { key: "rat:", descriptionKey: "rat", group: "common", availableOn: ["map"] },
  { key: "band:", descriptionKey: "band", group: "common", availableOn: ["map"] },
  { key: "status:", descriptionKey: "status", group: "common", availableOn: ["stations"] },
  { key: "has_photo:", descriptionKey: "hasPhoto", group: "common", availableOn: ["map", "stations"] },
  { key: "has_azimuth:", descriptionKey: "hasAzimuth", group: "common", availableOn: ["map", "stations"] },
  { key: "gps:", descriptionKey: "gps", group: "location", availableOn: ["map", "stations"] },
  { key: "region:", descriptionKey: "region", group: "location", availableOn: ["map"] },
  { key: "duplex:", descriptionKey: "duplex", group: "cell", availableOn: ["map", "stations"] },
  { key: "is_confirmed:", descriptionKey: "isConfirmed", group: "cell", availableOn: ["map", "stations"] },
  { key: "cell_notes:", descriptionKey: "cellNotes", group: "cell", availableOn: ["map", "stations"] },
  { key: "cell_type:", descriptionKey: "cellType", group: "cell", availableOn: ["map", "stations"] },
  { key: "lac:", descriptionKey: "lac", group: "gsm", availableOn: ["map", "stations"] },
  { key: "cid:", descriptionKey: "cid", group: "gsm", availableOn: ["map", "stations"] },
  { key: "rnc:", descriptionKey: "rnc", group: "umts", availableOn: ["map", "stations"] },
  { key: "umts_cid:", descriptionKey: "umtsCid", group: "umts", availableOn: ["map", "stations"] },
  { key: "cid_long:", descriptionKey: "cidLong", group: "umts", availableOn: ["map", "stations"] },
  { key: "umts_lac:", descriptionKey: "umtsLac", group: "umts", availableOn: ["map", "stations"] },
  { key: "uarfcn:", descriptionKey: "uarfcn", group: "umts", availableOn: ["map", "stations"] },
  { key: "enbid:", descriptionKey: "enbid", group: "lte", availableOn: ["map", "stations"] },
  { key: "ecid:", descriptionKey: "ecid", group: "lte", availableOn: ["map", "stations"] },
  { key: "lte_clid:", descriptionKey: "lteClid", group: "lte", availableOn: ["map", "stations"] },
  { key: "tac:", descriptionKey: "tac", group: "lte", availableOn: ["map", "stations"] },
  { key: "lte_pci:", descriptionKey: "ltePci", group: "lte", availableOn: ["map", "stations"] },
  { key: "earfcn:", descriptionKey: "earfcn", group: "lte", availableOn: ["map", "stations"] },
  { key: "supports_iot:", descriptionKey: "supportsIot", group: "lte", availableOn: ["map", "stations"] },
  { key: "gnbid:", descriptionKey: "gnbid", group: "nr", availableOn: ["map", "stations"] },
  { key: "nci:", descriptionKey: "nci", group: "nr", availableOn: ["map", "stations"] },
  { key: "nr_clid:", descriptionKey: "nrClid", group: "nr", availableOn: ["map", "stations"] },
  { key: "nrtac:", descriptionKey: "nrtac", group: "nr", availableOn: ["map", "stations"] },
  { key: "nr_pci:", descriptionKey: "nrPci", group: "nr", availableOn: ["map", "stations"] },
  { key: "arfcn:", descriptionKey: "arfcn", group: "nr", availableOn: ["map", "stations"] },
  { key: "supports_nr_redcap:", descriptionKey: "supportsNrRedcap", group: "nr", availableOn: ["map", "stations"] },
  { key: "networks_id:", descriptionKey: "networksId", group: "identifiers", availableOn: ["map", "stations"] },
  { key: "networks_name:", descriptionKey: "networksName", group: "identifiers", availableOn: ["map", "stations"] },
  { key: "mno_name:", descriptionKey: "mnoName", group: "identifiers", availableOn: ["map", "stations"] },
  { key: "created_after:", descriptionKey: "createdAfter", group: "date", availableOn: ["map", "stations"] },
  { key: "created_before:", descriptionKey: "createdBefore", group: "date", availableOn: ["map", "stations"] },
  { key: "updated_after:", descriptionKey: "updatedAfter", group: "date", availableOn: ["map", "stations"] },
  { key: "updated_before:", descriptionKey: "updatedBefore", group: "date", availableOn: ["map", "stations"] },
];

export const FILTER_REGEX = /(\w+):\s*(?:'([^']*)'|"([^"]*)"|([^\s]+))(?=\s|$)/gi;

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
export const FLOATING_NAV_MAP_OFFSET_CLASS = "[--floating-nav-map-offset:calc(1.25rem+var(--floating-nav-pwa-bottom-offset,0rem))]";

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
  // Station filters
  { key: "bts_id:", description: "Station ID", availableOn: ["map", "stations"] },
  { key: "mnc:", description: "Operator PLMN code (e.g. 26003)", availableOn: ["map"] },
  { key: "has_photo:", description: "Has photo (true, false)", availableOn: ["map", "stations"] },
  { key: "created_after:", description: "Created after date (YYYY-MM-DD)", availableOn: ["map", "stations"] },
  { key: "created_before:", description: "Created before date (YYYY-MM-DD)", availableOn: ["map", "stations"] },
  { key: "updated_after:", description: "Updated after date (YYYY-MM-DD)", availableOn: ["map", "stations"] },
  { key: "updated_before:", description: "Updated before date (YYYY-MM-DD)", availableOn: ["map", "stations"] },

  // GPS filter
  { key: "gps:", description: "GPS coordinates (lat,lng)", availableOn: ["map", "stations"] },

  // Location filters
  { key: "city:", description: "City name", availableOn: ["map", "stations"] },
  { key: "address:", description: "Address", availableOn: ["map", "stations"] },
  { key: "region:", description: "Region code (e.g., MAZ, SL, WP)", availableOn: ["map"] },

  // Cell filters
  { key: "band:", description: "Frequency in MHz (e.g., 800, 1800, 2100)", availableOn: ["map"] },
  { key: "duplex:", description: "Band duplex (FDD, TDD, null/false)", availableOn: ["map", "stations"] },
  { key: "rat:", description: "Standard (GSM, UMTS, LTE, NR)", availableOn: ["map"] },
  { key: "is_confirmed:", description: "Confirmation status (true, false)", availableOn: ["map", "stations"] },
  { key: "cell_notes:", description: "Cell notes", availableOn: ["map", "stations"] },

  // GSM cell filters
  { key: "lac:", description: "GSM Location Area Code", availableOn: ["map", "stations"] },
  { key: "cid:", description: "GSM Cell ID", availableOn: ["map", "stations"] },

  // UMTS cell filters
  { key: "rnc:", description: "UMTS Radio Network Controller ID", availableOn: ["map", "stations"] },
  { key: "umts_cid:", description: "UMTS Cell ID", availableOn: ["map", "stations"] },
  { key: "cid_long:", description: "UMTS Long Cell ID", availableOn: ["map", "stations"] },
  { key: "umts_lac:", description: "UMTS Location Area Code", availableOn: ["map", "stations"] },
  { key: "uarfcn:", description: "UMTS UARFCN value", availableOn: ["map", "stations"] },

  // LTE cell filters
  { key: "enbid:", description: "LTE eNodeB ID", availableOn: ["map", "stations"] },
  { key: "ecid:", description: "LTE E-UTRAN Cell ID", availableOn: ["map", "stations"] },
  { key: "lte_clid:", description: "LTE Cell Local ID", availableOn: ["map", "stations"] },
  { key: "tac:", description: "LTE Tracking Area Code", availableOn: ["map", "stations"] },
  { key: "lte_pci:", description: "LTE Physical Cell ID", availableOn: ["map", "stations"] },
  { key: "earfcn:", description: "LTE EARFCN value", availableOn: ["map", "stations"] },
  { key: "supports_iot:", description: "Supports IoT (true, false)", availableOn: ["map", "stations"] },

  // NR (5G) cell filters
  { key: "gnbid:", description: "5G gNodeB ID", availableOn: ["map", "stations"] },
  { key: "nci:", description: "5G NR Cell Identity", availableOn: ["map", "stations"] },
  { key: "nr_clid:", description: "5G Cell Local ID", availableOn: ["map", "stations"] },
  { key: "nrtac:", description: "5G Tracking Area Code", availableOn: ["map", "stations"] },
  { key: "nr_pci:", description: "5G Physical Cell ID", availableOn: ["map", "stations"] },
  { key: "arfcn:", description: "5G NR ARFCN value", availableOn: ["map", "stations"] },
  { key: "supports_nr_redcap:", description: "Supports RedCap (true, false)", availableOn: ["map", "stations"] },

  // Extra Identificators filters
  { key: "networks_id:", description: "NetWorks ID", availableOn: ["map", "stations"] },
  { key: "networks_name:", description: "NetWorks name", availableOn: ["map", "stations"] },
  { key: "mno_name:", description: "MNO name", availableOn: ["map", "stations"] },
];

export const FILTER_REGEX = /(\w+):\s*(?:'([^']*)'|"([^"]*)"|([^\s]+))(?=\s|$)/gi;

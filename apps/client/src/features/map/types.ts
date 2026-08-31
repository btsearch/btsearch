export type { GeocodingResult as OSMResult } from "@/lib/mapboxGeocoding";

export type ParsedFilter = {
  key: string;
  value: string;
  raw: string;
};

export type FilterKeyword = {
  key: string;
  descriptionKey: string;
  group: "common" | "location" | "cell" | "gsm" | "umts" | "lte" | "nr" | "identifiers" | "date";
  availableOn: ("map" | "stations")[];
};

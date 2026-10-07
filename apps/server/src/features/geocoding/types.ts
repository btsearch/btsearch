import { GEOCODING_KINDS } from "@openbts/shared/contract";
import type { GeocodingKind, GeocodingSource } from "@openbts/shared/contract";
import { z } from "zod/v4";

export const GeocodingResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(GEOCODING_KINDS),
  latitude: z.number(),
  longitude: z.number(),
  address: z.object({
    street: z.string().nullable(),
    houseNumber: z.string().nullable(),
    postcode: z.string().nullable(),
    city: z.string().nullable(),
    municipality: z.string().nullable(),
    county: z.string().nullable(),
    region: z.string().nullable(),
    country: z.string().nullable(),
    countryCode: z.string().nullable(),
  }),
});

export type { GeocodingKind, GeocodingSource };
export type GeocodingResult = z.infer<typeof GeocodingResultSchema>;
export type GeocodingSearchResponse = { source: GeocodingSource | null; results: GeocodingResult[] };
export type ReverseGeocodingResponse = { source: GeocodingSource | null; result: GeocodingResult | null };

export type GeocodingScope = { language: string; countryCodes: readonly string[] };

export type GeocodingProvider = {
  source: GeocodingSource;
  search(query: string, scope: GeocodingScope): Promise<GeocodingResult[]>;
  reverse(latitude: number, longitude: number, language: string): Promise<GeocodingResult | null>;
};

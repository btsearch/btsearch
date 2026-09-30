import { z } from "zod/v4";

const GEOCODING_SOURCES = ["geoapify", "locationiq"] as const;
const GEOCODING_KINDS = ["country", "region", "county", "city", "district", "postcode", "street", "address", "place"] as const;

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

const GeocodingSourceSchema = z.enum(GEOCODING_SOURCES).nullable();

export const GeocodingSearchResponseSchema = z.object({
  source: GeocodingSourceSchema,
  results: z.array(GeocodingResultSchema),
});

export const ReverseGeocodingResponseSchema = z.object({
  source: GeocodingSourceSchema,
  result: GeocodingResultSchema.nullable(),
});

export type GeocodingSource = (typeof GEOCODING_SOURCES)[number];
export type GeocodingKind = (typeof GEOCODING_KINDS)[number];
export type GeocodingResult = z.infer<typeof GeocodingResultSchema>;
export type GeocodingSearchResponse = z.infer<typeof GeocodingSearchResponseSchema>;
export type ReverseGeocodingResponse = z.infer<typeof ReverseGeocodingResponseSchema>;

export type GeocodingProvider = {
  source: GeocodingSource;
  search(query: string): Promise<GeocodingResult[]>;
  reverse(latitude: number, longitude: number): Promise<GeocodingResult | null>;
};

import { z } from "zod/v4";

import { countryCodeSchema, csvCountryCodesSchema, latitudeQuerySchema, longitudeQuerySchema } from "./common.ts";

export const GEOCODING_SOURCES = ["geoapify", "locationiq"] as const;
export type GeocodingSource = (typeof GEOCODING_SOURCES)[number];

export const GEOCODING_KINDS = ["country", "region", "county", "city", "district", "postcode", "street", "address", "place"] as const;
export type GeocodingKind = (typeof GEOCODING_KINDS)[number];

const languageSchema = z
  .string()
  .regex(/^[a-z]{2}$/, "Must be a two-letter language code in lower case")
  .default("en");

const LANGUAGE_NOTE =
  "The language of the returned names, as a two-letter code such as `de`. English is used if the geocoding providers do not support it";

export const geocodedPlaceSchema = z.object({
  id: z.string().describe("An opaque id that tells the results apart. It is not an id in the database"),
  source: z.enum(GEOCODING_SOURCES).describe("The geocoding provider the place came from"),
  name: z.string().describe("The main label of the place, such as a street with a house number or the name of a city"),
  description: z
    .string()
    .nullable()
    .describe("A second label that says where the place is, such as its postcode, city and country. `null` if there is nothing to add to `name`"),
  kind: z
    .enum(GEOCODING_KINDS)
    .describe(
      "The type of place. `region` is a state or province, `city` also covers towns and villages, `district` is a part of a city, " +
        "`address` is a single building, and `place` is anything else",
    ),
  latitude: z.number(),
  longitude: z.number(),
  address: z.object({
    street: z.string().nullable(),
    houseNumber: z.string().nullable(),
    postcode: z.string().nullable(),
    city: z.string().nullable(),
    municipality: z.string().nullable(),
    county: z.string().nullable(),
    region: z.string().nullable().describe("The name of the state, province or similar division, taken from the geocoding provider"),
    country: z.string().nullable(),
    countryCode: countryCodeSchema.nullable(),
  }),
});
export type GeocodedPlace = z.infer<typeof geocodedPlaceSchema>;

export const geocodingSearchQuerySchema = z
  .object({
    q: z.string().trim().min(3).max(200).describe("The address or place name to search for"),
    countryCodes: csvCountryCodesSchema.optional().describe("Limits the search to these countries. Comma-separated two-letter country codes"),
    language: languageSchema.describe(LANGUAGE_NOTE),
  })
  .strict();
export type GeocodingSearchQuery = z.infer<typeof geocodingSearchQuerySchema>;

export const geocodingReverseQuerySchema = z
  .object({
    latitude: latitudeQuerySchema,
    longitude: longitudeQuerySchema,
    language: languageSchema.describe(LANGUAGE_NOTE),
  })
  .strict();
export type GeocodingReverseQuery = z.infer<typeof geocodingReverseQuerySchema>;

import { z } from "zod/v4";

import { GEOCODING_SEARCH_LIMIT } from "./config.js";
import { GeocodingProviderError, createResultId, describePlace, fetchProviderJson, formatRegion, getStatusCooldownMs, pickText } from "./provider.js";
import type { GeocodingKind, GeocodingProvider, GeocodingResult } from "./types.js";

const GEOAPIFY_API_URL = "https://api.geoapify.com/v1/geocode";

const GeoapifyResultSchema = z.object({
  place_id: z.string().optional(),
  result_type: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  name: z.string().optional(),
  formatted: z.string().optional(),
  address_line1: z.string().optional(),
  street: z.string().optional(),
  housenumber: z.string().optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
  town: z.string().optional(),
  village: z.string().optional(),
  hamlet: z.string().optional(),
  municipality: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
});
type GeoapifyResult = z.infer<typeof GeoapifyResultSchema>;

const GeoapifyResponseSchema = z.object({ results: z.array(z.unknown()) });
const GeoapifyErrorSchema = z.object({ message: z.string() });

const RESULT_KINDS: Partial<Record<string, GeocodingKind>> = {
  country: "country",
  state: "region",
  county: "county",
  city: "city",
  district: "district",
  suburb: "district",
  postcode: "postcode",
  street: "street",
  building: "address",
};

function toGeocodingResult(result: GeoapifyResult): GeocodingResult | null {
  const kind = RESULT_KINDS[result.result_type ?? ""] ?? "place";
  const address = {
    street: pickText(result.street),
    houseNumber: pickText(result.housenumber),
    postcode: pickText(result.postcode),
    city: pickText(result.city, result.town, result.village, result.hamlet),
    municipality: pickText(result.municipality),
    county: pickText(result.county),
    region: formatRegion(result.state),
    country: pickText(result.country),
    countryCode: pickText(result.country_code),
  };
  const name = pickText(kind === "region" ? address.region : null, result.address_line1, result.name, result.formatted);
  if (!name) return null;

  return {
    id: createResultId("geoapify", result.place_id, result.lat, result.lon),
    name,
    description: describePlace(kind, name, address),
    kind,
    latitude: result.lat,
    longitude: result.lon,
    address,
  };
}

function parseResult(item: unknown): GeocodingResult | null {
  const result = GeoapifyResultSchema.safeParse(item);
  return result.success ? toGeocodingResult(result.data) : null;
}

async function requestResults(apiKey: string, endpoint: "autocomplete" | "reverse", params: Record<string, string>): Promise<GeocodingResult[]> {
  const url = new URL(`${GEOAPIFY_API_URL}/${endpoint}`);
  url.search = new URLSearchParams({ ...params, format: "json", apiKey }).toString();

  const { status, body } = await fetchProviderJson(url);
  if (status !== 200) {
    const message = GeoapifyErrorSchema.safeParse(body).data?.message ?? `HTTP ${status}`;
    throw new GeocodingProviderError(message, { status, cooldownMs: getStatusCooldownMs(status) });
  }

  const parsed = GeoapifyResponseSchema.safeParse(body);
  if (!parsed.success) throw new GeocodingProviderError("Invalid response", { status, cause: parsed.error });
  return parsed.data.results.map(parseResult).filter((result): result is GeocodingResult => result !== null);
}

export function createGeoapifyProvider(apiKey: string): GeocodingProvider {
  return {
    source: "geoapify",
    search(query, { language, countryCodes }) {
      const params: Record<string, string> = { text: query, limit: String(GEOCODING_SEARCH_LIMIT), lang: language };
      if (countryCodes.length > 0) params.filter = `countrycode:${countryCodes.join(",")}`;

      return requestResults(apiKey, "autocomplete", params);
    },
    async reverse(latitude, longitude, language) {
      const [result] = await requestResults(apiKey, "reverse", { lat: String(latitude), lon: String(longitude), lang: language });
      return result ?? null;
    },
  };
}

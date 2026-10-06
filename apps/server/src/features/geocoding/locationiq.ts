import { z } from "zod/v4";

import { GEOCODING_SEARCH_LIMIT } from "./config.js";
import {
  GeocodingProviderError,
  createResultId,
  describePlace,
  fetchProviderJson,
  formatRegion,
  formatStreetLine,
  getStatusCooldownMs,
  pickText,
} from "./provider.js";
import type { GeocodingKind, GeocodingProvider, GeocodingResult } from "./types.js";

const LOCATIONIQ_AUTOCOMPLETE_URL = "https://api.locationiq.com/v1/autocomplete";
const LOCATIONIQ_REVERSE_URL = "https://eu1.locationiq.com/v1/reverse";
const NO_RESULTS_ERROR = /unable to geocode/i;

const coordinate = z.union([z.number(), z.string().trim().min(1).transform(Number)]).pipe(z.number());

const LocationIqAddressSchema = z.object({
  name: z.string().optional(),
  house_number: z.string().optional(),
  road: z.string().optional(),
  city: z.string().optional(),
  town: z.string().optional(),
  village: z.string().optional(),
  hamlet: z.string().optional(),
  municipality: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
});

const LocationIqPlaceSchema = z.object({
  osm_type: z.string().optional(),
  osm_id: z.union([z.string(), z.number()]).optional(),
  class: z.string().optional(),
  type: z.string().optional(),
  lat: coordinate,
  lon: coordinate,
  display_name: z.string().optional(),
  display_place: z.string().optional(),
  address: LocationIqAddressSchema.default({}),
});
type LocationIqPlace = z.infer<typeof LocationIqPlaceSchema>;

const LocationIqErrorSchema = z.object({ error: z.string() });

const PLACE_KINDS: Partial<Record<string, GeocodingKind>> = {
  country: "country",
  state: "region",
  province: "region",
  county: "county",
  city: "city",
  town: "city",
  village: "city",
  hamlet: "city",
  borough: "district",
  suburb: "district",
  quarter: "district",
  neighbourhood: "district",
  postcode: "postcode",
  house: "address",
};

function getKind(place: LocationIqPlace, name: string, city: string | null): GeocodingKind {
  const { address } = place;
  if (place.class === "highway") return "street";
  if (place.class === "place") return PLACE_KINDS[place.type ?? ""] ?? "place";
  if (place.class === "boundary") {
    if (name === city) return "city";
    if (name === address.county) return "county";
    if (name === address.state) return "region";
    if (name === address.country) return "country";
  }
  if (address.house_number) return "address";
  return place.class === undefined && address.road ? "street" : "place";
}

function toGeocodingResult(place: LocationIqPlace): GeocodingResult | null {
  const details = place.address;
  const address = {
    street: pickText(details.road),
    houseNumber: pickText(details.house_number),
    postcode: pickText(details.postcode),
    city: pickText(details.city, details.town, details.village, details.hamlet),
    municipality: pickText(details.municipality),
    county: pickText(details.county),
    region: formatRegion(details.state),
    country: pickText(details.country),
    countryCode: pickText(details.country_code),
  };
  const streetLine = formatStreetLine(address.street, address.houseNumber, address.city);
  const placeName = pickText(
    address.houseNumber ? streetLine : null,
    place.display_place,
    details.name,
    streetLine,
    address.city,
    place.display_name?.split(",")[0],
  );
  if (!placeName) return null;

  const kind = getKind(place, placeName, address.city);
  const name = kind === "region" && address.region ? address.region : placeName;
  return {
    id: createResultId("locationiq", place.osm_type, place.osm_id, place.lat, place.lon),
    name,
    description: describePlace(kind, name, address),
    kind,
    latitude: place.lat,
    longitude: place.lon,
    address,
  };
}

function parsePlace(item: unknown): GeocodingResult | null {
  const place = LocationIqPlaceSchema.safeParse(item);
  return place.success ? toGeocodingResult(place.data) : null;
}

function getRateLimitCooldownMs(message: string): number {
  if (/second/i.test(message)) return 1_000;
  if (/day/i.test(message)) {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  }
  return getStatusCooldownMs(429);
}

async function requestLocationIq(url: URL): Promise<{ body: unknown } | null> {
  const { status, body } = await fetchProviderJson(url);
  if (status === 200) return { body };

  const message = LocationIqErrorSchema.safeParse(body).data?.error ?? `HTTP ${status}`;
  if (status === 404 && NO_RESULTS_ERROR.test(message)) return null;
  const cooldownMs = status === 429 ? getRateLimitCooldownMs(message) : getStatusCooldownMs(status);
  throw new GeocodingProviderError(message, { status, cooldownMs });
}

export function createLocationIqProvider(apiKey: string): GeocodingProvider {
  return {
    source: "locationiq",
    async search(query, { language, countryCodes }) {
      const url = new URL(LOCATIONIQ_AUTOCOMPLETE_URL);
      const params = new URLSearchParams({
        key: apiKey,
        q: query,
        "accept-language": language,
        limit: String(GEOCODING_SEARCH_LIMIT),
        dedupe: "1",
      });
      if (countryCodes.length > 0) params.set("countrycodes", countryCodes.join(","));
      url.search = params.toString();

      const response = await requestLocationIq(url);
      if (!response) return [];
      const parsed = z.array(z.unknown()).safeParse(response.body);
      if (!parsed.success) throw new GeocodingProviderError("Invalid response", { cause: parsed.error });
      return parsed.data.map(parsePlace).filter((result): result is GeocodingResult => result !== null);
    },
    async reverse(latitude, longitude, language) {
      const url = new URL(LOCATIONIQ_REVERSE_URL);
      url.search = new URLSearchParams({
        key: apiKey,
        lat: String(latitude),
        lon: String(longitude),
        format: "json",
        "accept-language": language,
        source: "nom",
      }).toString();

      const response = await requestLocationIq(url);
      if (!response) return null;
      const place = LocationIqPlaceSchema.safeParse(response.body);
      if (!place.success) throw new GeocodingProviderError("Invalid response", { cause: place.error });
      return toGeocodingResult(place.data);
    },
  };
}

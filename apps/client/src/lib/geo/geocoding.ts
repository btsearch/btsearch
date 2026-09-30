import { BackendUnavailableError, fetchApiData } from "@/lib/api";

export type GeocodingSource = "geoapify" | "locationiq";

export type GeocodingKind = "country" | "region" | "county" | "city" | "district" | "postcode" | "street" | "address" | "place";

export type GeocodingResult = {
  id: string;
  name: string;
  description: string | null;
  kind: GeocodingKind;
  latitude: number;
  longitude: number;
  address: {
    street: string | null;
    houseNumber: string | null;
    postcode: string | null;
    city: string | null;
    municipality: string | null;
    county: string | null;
    region: string | null;
    country: string | null;
    countryCode: string | null;
  };
};

export type GeocodingSearchResponse = { source: GeocodingSource | null; results: GeocodingResult[] };
export type ReverseGeocodingResponse = { source: GeocodingSource | null; result: GeocodingResult | null };

export class GeocodingUnavailableError extends Error {
  constructor() {
    super("Geocoding is temporarily unavailable.");
  }
}

async function fetchGeocoding<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  return fetchApiData<T>(endpoint, { signal }).catch((error: unknown) => {
    if (error instanceof BackendUnavailableError) throw new GeocodingUnavailableError();
    throw error;
  });
}

export function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodingSearchResponse> {
  const params = new URLSearchParams({ q: query });
  return fetchGeocoding<GeocodingSearchResponse>(`geocoding/search?${params.toString()}`, signal);
}

export function reverseGeocode(latitude: number, longitude: number, signal?: AbortSignal): Promise<ReverseGeocodingResponse> {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  return fetchGeocoding<ReverseGeocodingResponse>(`geocoding/reverse?${params.toString()}`, signal);
}

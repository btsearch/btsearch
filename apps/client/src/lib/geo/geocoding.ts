const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
const MAPBOX_GEOCODING_API = "https://api.mapbox.com/search/geocode/v6";

type MapboxContextEntry = {
  mapbox_id: string;
  name: string;
  address_number?: string;
  street_name?: string;
};

type MapboxFeature = {
  id: string;
  geometry?: {
    coordinates?: [number, number];
  };
  properties: {
    feature_type?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: {
      longitude?: number;
      latitude?: number;
    };
    context?: {
      address?: MapboxContextEntry;
      street?: MapboxContextEntry;
      neighborhood?: MapboxContextEntry;
      locality?: MapboxContextEntry;
      place?: MapboxContextEntry;
      district?: MapboxContextEntry;
      region?: MapboxContextEntry;
      postcode?: MapboxContextEntry;
      country?: MapboxContextEntry;
    };
  };
};

type MapboxGeocodingResponse = {
  features: MapboxFeature[];
};

export type GeocodingResult = {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  addresstype?: string;
  address: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

function getContextText(feature: MapboxFeature, keys: Array<keyof NonNullable<MapboxFeature["properties"]["context"]>>): string | undefined {
  const context = feature.properties.context;
  if (!context) return undefined;

  for (const key of keys) {
    const entry = context[key];
    if (entry?.name) return entry.name;
  }

  return undefined;
}

function normalizeFeature(feature: MapboxFeature): GeocodingResult | null {
  const longitude = feature.properties.coordinates?.longitude ?? feature.geometry?.coordinates?.[0];
  const latitude = feature.properties.coordinates?.latitude ?? feature.geometry?.coordinates?.[1];
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;

  const primaryType = feature.properties.feature_type ?? "place";
  const city = getContextText(feature, ["place", "locality"]);
  const municipality = getContextText(feature, ["district", "locality"]);
  const contextAddress = feature.properties.context?.address;
  const contextStreet = feature.properties.context?.street;
  const fallbackDisplayName = [feature.properties.name, feature.properties.place_formatted].filter(Boolean).join(", ");
  const displayName = feature.properties.full_address ?? fallbackDisplayName ?? feature.properties.name;

  if (!displayName) return null;

  return {
    place_id: feature.id,
    display_name: displayName,
    lat: String(latitude),
    lon: String(longitude),
    type: primaryType,
    addresstype: primaryType,
    address: {
      road: contextStreet?.name ?? contextAddress?.street_name ?? (primaryType === "street" ? feature.properties.name : undefined),
      house_number: contextAddress?.address_number,
      city,
      town: city,
      village: getContextText(feature, ["locality", "neighborhood"]),
      municipality,
      state: getContextText(feature, ["region"]),
      postcode: getContextText(feature, ["postcode"]),
      country: getContextText(feature, ["country"]),
    },
  };
}

async function fetchMapboxJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mapbox geocoding request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function buildForwardUrl(query: string): string {
  const url = new URL(`${MAPBOX_GEOCODING_API}/forward`);
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN ?? "");
  url.searchParams.set("q", query);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("country", "pl");
  url.searchParams.set("language", "pl");
  url.searchParams.set("limit", "10");
  url.searchParams.set("types", "address,street,place,locality,neighborhood");
  return url.toString();
}

function buildReverseUrl(latitude: number, longitude: number): string {
  const url = new URL(`${MAPBOX_GEOCODING_API}/reverse`);
  url.searchParams.set("access_token", MAPBOX_ACCESS_TOKEN ?? "");
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("language", "pl");
  url.searchParams.set("types", "address,street,place,locality,neighborhood");
  return url.toString();
}

export async function forwardGeocode(query: string): Promise<GeocodingResult[]> {
  if (query.length < 3 || !MAPBOX_ACCESS_TOKEN) return [];

  const response = await fetchMapboxJson<MapboxGeocodingResponse>(buildForwardUrl(query));
  return response.features.map(normalizeFeature).filter((feature): feature is GeocodingResult => feature !== null);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult | null> {
  if (!MAPBOX_ACCESS_TOKEN) return null;

  const response = await fetchMapboxJson<MapboxGeocodingResponse>(buildReverseUrl(latitude, longitude));
  return response.features.map(normalizeFeature).find((feature): feature is GeocodingResult => feature !== null) ?? null;
}

const RAT_ORDER = ["NR", "LTE", "UMTS", "GSM"] as const;
const MAX_POSTGRES_INTEGER = 2_147_483_647;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const LIST_ID_PATTERN = /^[\w-]{14}$/;
const LIST_DESCRIPTION_MAX_LENGTH = 200;

export const DEFAULT_SEO_DESCRIPTION =
  "Największa i najstarsza mapa rzeczywistych stacji bazowych i radiolinii w Polsce. Sprawdź operatora, technologie 2G-5G, pasma, odległość i pozwolenia UKE";

export const DEFAULT_SOCIAL_DESCRIPTION =
  "Znajdź stację bazową lub radiolinię w swojej okolicy. Sprawdź odległość od nadajnika, operatora, technologie 2G-5G, wykorzystywane pasma oraz pozwolenia UKE";

export const DEFAULT_SOCIAL_IMAGE_PATH = "/btsearch.webp";
export const SEO_IMAGE_WIDTH = 1200;
export const SEO_IMAGE_HEIGHT = 630;

export type SEOSite = {
  name: string;
  url: string;
};

export type SEOMetadata = {
  title: string;
  siteName: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  noindex: boolean;
  jsonLd: JsonLdObject[];
};

export type JsonLdPrimitive = string | number | boolean | null;
export type JsonLdValue = JsonLdPrimitive | JsonLdObject | JsonLdValue[];
export type JsonLdObject = { [key: string]: JsonLdValue };

export type SEOBand = {
  rat: string;
  value: number | null;
};

export type StationSEOData = {
  id: number;
  stationCode: string;
  status: string | null | undefined;
  operatorName: string;
  networksLabel: string | null;
  city?: string | null;
  address?: string | null;
  regionName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  bands: readonly SEOBand[];
  siteSourceNames: readonly string[];
};

export type LocationSEOStation = {
  id: number;
  stationCode: string;
  operatorName?: string | null;
  status: string | null | undefined;
};

export type LocationSEOData = {
  id: number;
  city?: string | null;
  address?: string | null;
  regionName?: string | null;
  latitude: number;
  longitude: number;
  stations: readonly LocationSEOStation[];
  siteSourceNames: readonly string[];
};

export type ListSEOOperator = {
  name: string;
  count: number;
};

export type ListSEOData = {
  id: string;
  name: string;
  description?: string | null;
  ownerUsername?: string | null;
  stationCount: number;
  microwaveLinkCount: number;
  operators: readonly ListSEOOperator[];
  hasMoreOperators: boolean;
};

type BreadcrumbItem = {
  name: string;
  path?: string;
};

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function optionalStringProperty(name: string, value: string | null | undefined): JsonLdObject {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return {};
  return { [name]: normalized };
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function absoluteSiteUrl(siteUrl: string, path: string): string {
  return `${normalizeSiteUrl(siteUrl)}${path}`;
}

export function parseSEOEntityId(value: string): number | null {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id > MAX_POSTGRES_INTEGER) return null;
  return id;
}

export function parseSEOListId(value: string): string | null {
  return LIST_ID_PATTERN.test(value) ? value : null;
}

export function polishPlural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return few;
  return many;
}

export function stationsNoun(count: number): string {
  return polishPlural(count, "stacja", "stacje", "stacji");
}

export function microwaveLinksNoun(count: number): string {
  return polishPlural(count, "radiolinia", "radiolinie", "radiolinii");
}

function breadcrumbJsonLd(siteUrl: string, items: readonly BreadcrumbItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path === undefined ? {} : { item: absoluteSiteUrl(siteUrl, item.path) }),
    })),
  };
}

function summarizeBands(rows: readonly SEOBand[]): string {
  const bandsByRat = new Map<string, Set<number>>();

  for (const row of rows) {
    const rat = row.rat.toUpperCase();
    const values = bandsByRat.get(rat) ?? new Set<number>();
    if (row.value !== null) values.add(row.value);
    bandsByRat.set(rat, values);
  }

  return RAT_ORDER.filter((rat) => bandsByRat.has(rat))
    .map((rat) => {
      const values = [...(bandsByRat.get(rat) ?? [])].sort((a, b) => a - b);
      return values.length > 0 ? `${rat} ${values.join("/")}` : rat;
    })
    .join(", ");
}

function describePermits(siteSourceNames: readonly string[]): string | null {
  const names = new Set(siteSourceNames);
  if (names.size === 0) return null;
  const [onlyName] = names;
  return names.size === 1 ? `pozwolenia ${onlyName}` : "pozwolenia";
}

export function createStationSEOMetadata(site: SEOSite, station: StationSEOData): SEOMetadata {
  const city = normalizeOptionalString(station.city) ?? "Polska";
  const address = normalizeOptionalString(station.address);
  const path = `/stations/${station.id}`;
  const canonicalUrl = absoluteSiteUrl(site.url, path);
  const bandsSummary = summarizeBands(station.bands);
  const networksSuffix = station.networksLabel ? ` (${station.networksLabel})` : "";
  const name = `Stacja bazowa ${station.operatorName} ${station.stationCode}${networksSuffix}`;
  const permits = describePermits(station.siteSourceNames);

  return {
    title: `${name} - ${city} | ${site.name}`,
    siteName: site.name,
    description: `Stacja bazowa ${station.operatorName} w ${city}${address ? `, ${address}` : ""}.${bandsSummary ? ` Pasma: ${bandsSummary}.` : ""} Zobacz azymuty${permits ? `, ${permits}` : ""} i zdjęcia w bazie ${site.name}`,
    canonicalUrl,
    imageUrl: absoluteSiteUrl(site.url, `/public/og/stations/${station.id}.png`),
    noindex: station.status !== "published",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Place",
        name,
        url: canonicalUrl,
        identifier: station.stationCode,
        address: {
          "@type": "PostalAddress",
          ...optionalStringProperty("addressLocality", station.city),
          ...optionalStringProperty("streetAddress", address),
          ...optionalStringProperty("addressRegion", station.regionName),
          addressCountry: "PL",
        },
        ...(station.latitude !== null && station.latitude !== undefined && station.longitude !== null && station.longitude !== undefined
          ? { geo: { "@type": "GeoCoordinates", latitude: station.latitude, longitude: station.longitude } }
          : {}),
      },
      breadcrumbJsonLd(site.url, [
        { name: site.name, path: "/" },
        { name: "Baza stacji", path: "/stations" },
        { name: `${station.operatorName} ${station.stationCode}` },
      ]),
    ],
  };
}

export function createLocationSEOMetadata(site: SEOSite, location: LocationSEOData): SEOMetadata {
  const city = normalizeOptionalString(location.city) ?? "Polska";
  const address = normalizeOptionalString(location.address);
  const regionName = normalizeOptionalString(location.regionName);
  const label = address ? `${city}, ${address}` : city;
  const path = `/locations/${location.id}`;
  const canonicalUrl = absoluteSiteUrl(site.url, path);
  const indexableStations = location.stations
    .filter(
      (station): station is LocationSEOStation & { operatorName: string } =>
        station.status === "published" &&
        station.operatorName !== null &&
        station.operatorName !== undefined &&
        station.operatorName.trim().length > 0,
    )
    .map((station) => ({ ...station, operatorName: station.operatorName.trim() }))
    .sort((a, b) => a.id - b.id);
  const stationsSummary = indexableStations
    .slice(0, 8)
    .map((station) => `${station.operatorName} ${station.stationCode}`)
    .join(", ");
  const suffix = indexableStations.length > 8 ? "..." : "";
  const region = regionName ? ` (woj. ${regionName.toLowerCase()})` : "";
  const permits = describePermits(location.siteSourceNames);

  return {
    title: `Stacje bazowe - ${label} | ${site.name}`,
    siteName: site.name,
    description: `Lokalizacja stacji bazowych: ${label}${region}.${stationsSummary ? ` Stacje: ${stationsSummary}${suffix}.` : ""} Zobacz pasma${permits ? ` i ${permits}` : ""} w bazie ${site.name}`,
    canonicalUrl,
    imageUrl: absoluteSiteUrl(site.url, `/public/og/locations/${location.id}.png`),
    noindex: indexableStations.length === 0,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Place",
        name: `Stacje bazowe - ${label}`,
        url: canonicalUrl,
        address: {
          "@type": "PostalAddress",
          ...optionalStringProperty("addressLocality", location.city),
          ...optionalStringProperty("streetAddress", address),
          ...optionalStringProperty("addressRegion", regionName),
          addressCountry: "PL",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: location.latitude,
          longitude: location.longitude,
        },
      },
      breadcrumbJsonLd(site.url, [{ name: site.name, path: "/" }, { name: "Baza stacji", path: "/stations" }, { name: label }]),
    ],
  };
}

function summarizeListOperators(list: ListSEOData): string {
  if (list.operators.length === 0) return "";
  const operators = list.operators.map((operator) => `${operator.name}: ${operator.count}`).join(", ");
  return ` (${operators}${list.hasMoreOperators ? " i inni" : ""})`;
}

function shortenListDescription(description: string): string {
  const characters = [...description];
  if (characters.length <= LIST_DESCRIPTION_MAX_LENGTH) return description;
  return `${characters.slice(0, LIST_DESCRIPTION_MAX_LENGTH).join("").trimEnd()}...`;
}

export function createListSEOMetadata(site: SEOSite, list: ListSEOData): SEOMetadata {
  const owner = normalizeOptionalString(list.ownerUsername);
  const description = normalizeOptionalString(list.description)?.replace(/\s+/g, " ");
  const subject = owner ? `Lista użytkownika @${owner}` : "Lista";
  const stations = `${list.stationCount} ${stationsNoun(list.stationCount)}${description ? "" : summarizeListOperators(list)}`;
  const microwaveLinks = `${list.microwaveLinkCount} ${microwaveLinksNoun(list.microwaveLinkCount)}`;
  const contents = [list.stationCount > 0 ? stations : null, list.microwaveLinkCount > 0 ? microwaveLinks : null]
    .filter((part) => part !== null)
    .join(" i ");
  const summary = contents ? `${subject}: ${contents}.` : `${subject} jest pusta.`;
  const callToAction = contents ? ` Zobacz ją na mapie w bazie ${site.name}` : "";

  return {
    title: `${list.name} | ${site.name}`,
    siteName: site.name,
    description: `${summary}${description ? ` ${shortenListDescription(description)}` : callToAction}`,
    canonicalUrl: absoluteSiteUrl(site.url, `/lists/${list.id}`),
    imageUrl: absoluteSiteUrl(site.url, `/public/og/lists/${list.id}.png`),
    noindex: true,
    jsonLd: [],
  };
}

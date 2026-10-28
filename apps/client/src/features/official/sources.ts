import type { Country, OfficialLayer, OfficialSource } from "@openbts/shared/contract";

type OfficialAttributionSource = Pick<OfficialSource, "attribution" | "coverageNote" | "datasets">;
type NamedSource = Pick<OfficialSource, "shortName" | "datasets">;
type ListedSource = Pick<OfficialSource, "countryCode" | "shortName" | "datasets">;
type PublicListedSource = ListedSource & Pick<OfficialSource, "isVisible">;
type CapableCountry = Pick<Country, "code" | "capabilities">;

function publishesLayer(source: Pick<OfficialSource, "datasets">, layer: OfficialLayer): boolean {
  return source.datasets.some((dataset) => dataset.layer === layer);
}

function isInCountry(countryCode: string | null, sourceCountryCode: string): boolean {
  return countryCode === null || sourceCountryCode === countryCode;
}

export function listOfficialAttributions(sources: readonly OfficialAttributionSource[], shownLayers: readonly OfficialLayer[]): string[] {
  const attributions = sources
    .filter((source) => source.datasets.some((dataset) => shownLayers.includes(dataset.layer)))
    .map(({ attribution, coverageNote }) => (coverageNote === null ? attribution : `${attribution} ${coverageNote}`));
  return [...new Set(attributions)];
}

function findLayerSourceName(sources: readonly NamedSource[], layer: OfficialLayer): string | null {
  const shortNames = new Set(sources.filter((source) => publishesLayer(source, layer)).map((source) => source.shortName));
  const [onlyName] = shortNames;
  return shortNames.size === 1 ? onlyName : null;
}

export function findSiteSourceName(sources: readonly NamedSource[]): string | null {
  return findLayerSourceName(sources, "sites");
}

export function listSiteSources<Source extends ListedSource>(sources: readonly Source[], countryCode: string | null): Source[] {
  return sources.filter((source) => publishesLayer(source, "sites") && isInCountry(countryCode, source.countryCode));
}

export function listPublicSiteSourceNames(sources: readonly PublicListedSource[], countryCode: string | null): string[] {
  if (countryCode === null) return [];
  return listSiteSources(sources, countryCode)
    .filter((source) => source.isVisible)
    .map((source) => source.shortName);
}

export function findCountrySourceName(sources: readonly ListedSource[], countryCode: string | null, layer: OfficialLayer = "sites"): string | null {
  return findLayerSourceName(
    sources.filter((source) => isInCountry(countryCode, source.countryCode)),
    layer,
  );
}

export function hasOfficialData(countries: readonly CapableCountry[] | undefined, countryCode: string | null): boolean {
  return countries?.some((country) => country.capabilities.official && isInCountry(countryCode, country.code)) ?? false;
}

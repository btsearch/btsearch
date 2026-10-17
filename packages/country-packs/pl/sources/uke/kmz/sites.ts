import { destinationPoint } from "@openbts/shared/geo";
import { DEFAULT_OPERATOR_COLOR } from "@openbts/shared/operatorUtils";
import { formatPermitLabel } from "@openbts/shared/permitLabel";

import { bucketOf, entriesSortedByKey } from "../shared/collections.ts";
import { rowsCreatedOnNewestDay } from "../shared/dates.ts";
import type { KmzDocument } from "./documents.ts";
import { decisionCode, escapeXml, folder, hexToKmlColor, iconStyle, lineStyle, placemark, wrapKml } from "./kml.ts";
import type { KmzPermit } from "./read.ts";

const AZIMUTH_LINE_LENGTH_M = 300;
const SITE_ICON_URL = "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png";
const DATASET_FILE_NAMES: readonly (readonly [datasetKey: string, fileName: string])[] = [
  ["permits", "permits"],
  ["device-registry", "device_registry"],
];

type KmzSite = {
  siteId: string;
  operatorName: string;
  color: string;
  longitude: number;
  latitude: number;
  city: string | null;
  address: string | null;
  regionName: string;
  regionCode: string;
  permits: KmzPermit[];
  azimuths: Set<number>;
};

export function groupBySite(permits: readonly KmzPermit[]): KmzSite[] {
  const sites = new Map<number, KmzSite>();

  for (const permit of permits) {
    let site = sites.get(permit.officialSiteId);
    if (!site) {
      site = {
        siteId: permit.siteId,
        operatorName: permit.operatorName,
        color: permit.color ?? DEFAULT_OPERATOR_COLOR,
        longitude: permit.longitude,
        latitude: permit.latitude,
        city: permit.city,
        address: permit.address,
        regionName: permit.regionName,
        regionCode: permit.regionCode,
        permits: [],
        azimuths: new Set(),
      };
      sites.set(permit.officialSiteId, site);
    }

    site.permits.push(permit);
    for (const azimuth of permit.azimuths) {
      if (azimuth !== null) site.azimuths.add(azimuth);
    }
  }

  return [...sites.values()];
}

function siteDescription(site: KmzSite): string {
  const lines: string[] = [];
  if (site.city) lines.push(`<b>City:</b> ${escapeXml(site.city)}`);
  if (site.address) lines.push(`<b>Address:</b> ${escapeXml(site.address)}`);
  lines.push(`<b>Region:</b> ${escapeXml(site.regionName)}`);

  const azimuths = [...site.azimuths].sort((a, b) => a - b);
  if (azimuths.length > 0) lines.push(`<b>Azimuths:</b> ${azimuths.map((azimuth) => `${azimuth}°`).join(", ")}`);

  lines.push("", `<b>Permits (${site.permits.length}):</b>`);
  for (const permit of site.permits) {
    const decision = `${escapeXml(permit.decisionNumber)} [${decisionCode(permit.decisionType)}]`;
    const expiry = permit.expiresOn === null ? "no expiry" : `expires ${permit.expiresOn}`;
    lines.push(`${escapeXml(formatPermitLabel(permit.label))}: ${decision} - ${expiry}`);
  }

  return lines.join("<br/>");
}

function azimuthStyleId(color: string): string {
  return `azimuth-${color.slice(1)}`;
}

function siteIconStyleId(color: string): string {
  return `station-icon-${color.slice(1)}`;
}

function operatorFolders(placemarksByOperator: ReadonlyMap<string, string[]>): string[] {
  return entriesSortedByKey(placemarksByOperator).map(([operatorName, placemarks]) => folder(operatorName, placemarks.join("\n"), false));
}

export function sitesKml(sites: readonly KmzSite[], title: string): string {
  const sitePlacemarksByOperator = new Map<string, string[]>();
  const azimuthPlacemarksByOperator = new Map<string, string[]>();
  const colors = new Set<string>();

  for (const site of sites) {
    const azimuthPlacemarks = bucketOf(azimuthPlacemarksByOperator, site.operatorName);
    const labels = [...new Set(site.permits.map((permit) => formatPermitLabel(permit.label)))].join(", ");
    colors.add(site.color);

    bucketOf(sitePlacemarksByOperator, site.operatorName).push(
      placemark(
        site.siteId,
        `<b>Bands:</b> ${escapeXml(labels)}<br/>${siteDescription(site)}`,
        `<Point><coordinates>${site.longitude},${site.latitude},0</coordinates></Point>`,
        `#${siteIconStyleId(site.color)}`,
      ),
    );

    for (const azimuth of site.azimuths) {
      const [endLatitude, endLongitude] = destinationPoint(site.latitude, site.longitude, azimuth, AZIMUTH_LINE_LENGTH_M);
      azimuthPlacemarks.push(
        placemark(
          site.siteId,
          `<b>Azimuth:</b> ${azimuth}°`,
          `<LineString><coordinates>${site.longitude},${site.latitude},0 ${endLongitude},${endLatitude},0</coordinates></LineString>`,
          `#${azimuthStyleId(site.color)}`,
        ),
      );
    }
  }

  const siteIconStyles = [...colors].map((color) => iconStyle(siteIconStyleId(color), SITE_ICON_URL, 0.9, hexToKmlColor(color)));
  const azimuthStyles = [...colors].map((color) => lineStyle(azimuthStyleId(color), hexToKmlColor(color), 3));
  const styles = [...siteIconStyles, ...azimuthStyles].join("\n");
  const siteFolders = folder("Stacje", operatorFolders(sitePlacemarksByOperator).join("\n"), true);
  const azimuthFolders = folder("Azymuty", operatorFolders(azimuthPlacemarksByOperator).join("\n"), false);

  return wrapKml(title, [styles, siteFolders, azimuthFolders].join("\n"));
}

function* siteSetDocuments(sites: readonly KmzSite[], filePrefix: string, title: string): Generator<KmzDocument> {
  yield { path: `${filePrefix}.kmz`, kml: sitesKml(sites, title) };

  const sitesByRegion = new Map<string, KmzSite[]>();
  for (const site of sites) bucketOf(sitesByRegion, site.regionCode).push(site);
  for (const [regionCode, regionSites] of entriesSortedByKey(sitesByRegion)) {
    yield { path: `${filePrefix}_${regionCode}.kmz`, kml: sitesKml(regionSites, `${title} - ${regionCode}`) };
  }
}

export function* siteDocuments(permits: readonly KmzPermit[], day: string): Generator<KmzDocument> {
  yield* siteSetDocuments(groupBySite(permits), `stations_${day}`, "Pozwolenia UKE");

  for (const [datasetKey, fileName] of DATASET_FILE_NAMES) {
    const listedPermits = permits.filter((permit) => permit.datasetKeys.includes(datasetKey));
    yield* siteSetDocuments(groupBySite(listedPermits), `${fileName}/stations_${day}_${fileName}`, `Pozwolenia UKE - ${fileName}`);
  }

  const newest = rowsCreatedOnNewestDay(permits);
  if (newest) yield { path: `stations_new_${newest.day}.kmz`, kml: sitesKml(groupBySite(newest.rows), `Pozwolenia UKE - nowe (${newest.day})`) };
}

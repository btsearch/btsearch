import { calculateDistance, formatDistance } from "@openbts/shared/geo";
import {
  type MicrowaveLinkDirection,
  type MicrowaveLinkSpeeds,
  type MicrowaveLinkType,
  calculateLinkDirectionalSpeeds,
  calculateMicrowaveLinkSpeed,
  formatBandwidth,
  formatFrequency,
  formatSpeed,
  groupMicrowaveLinks,
} from "@openbts/shared/microwaveLinkUtils";
import { DEFAULT_OPERATOR_COLOR } from "@openbts/shared/operatorUtils";

import { bucketOf, entriesSortedByKey } from "../shared/collections.ts";
import { rowsCreatedOnNewestDay } from "../shared/dates.ts";
import type { KmzDocument } from "./documents.ts";
import { decisionCode, escapeXml, folder, hexToKmlColor, lineStyle, placemark, wrapKml } from "./kml.ts";
import type { KmzLink } from "./read.ts";

const REGION_CODE_BY_PROVINCE: ReadonlyMap<string, string> = new Map([
  ["dolnośląskie", "DLN"],
  ["kujawsko-pomorskie", "KPM"],
  ["lubelskie", "LUB"],
  ["lubuskie", "LBS"],
  ["łódzkie", "LDZ"],
  ["małopolskie", "MLP"],
  ["mazowieckie", "MAZ"],
  ["opolskie", "OPO"],
  ["podkarpackie", "PDK"],
  ["podlaskie", "POD"],
  ["pomorskie", "POM"],
  ["śląskie", "SLK"],
  ["świętokrzyskie", "SWK"],
  ["warmińsko-mazurskie", "WRM"],
  ["wielkopolskie", "WKP"],
  ["zachodniopomorskie", "ZPM"],
]);

type KmzLinkDirection = MicrowaveLinkDirection & { entry: KmzLink; position: number };
type KmzLinkGroup = { first: KmzLink; entries: KmzLink[]; linkType: MicrowaveLinkType; speeds: MicrowaveLinkSpeeds };

function txPosition(link: KmzLink): string {
  return `${link.txLatitude},${link.txLongitude}`;
}

function rxPosition(link: KmzLink): string {
  return `${link.rxLatitude},${link.rxLongitude}`;
}

function licenseeKeyOf(licenseeName: string | null, licenseeKeys: Map<string, number>): number | null {
  if (licenseeName === null) return null;

  const key = licenseeKeys.get(licenseeName) ?? licenseeKeys.size + 1;
  licenseeKeys.set(licenseeName, key);
  return key;
}

function toLinkDirection(entry: KmzLink, position: number, licenseeKeys: Map<string, number>): KmzLinkDirection {
  return {
    entry,
    position,
    licenseeId: licenseeKeyOf(entry.licenseeName, licenseeKeys),
    permit: { number: entry.permitNumber },
    tx: { latitude: entry.txLatitude, longitude: entry.txLongitude },
    rx: { latitude: entry.rxLatitude, longitude: entry.rxLongitude },
    frequencyMhz: entry.freqKhz / 1000,
    polarization: entry.polarization,
    channelWidthMhz: entry.channelWidth,
    modulation: entry.modulationType,
  };
}

export function groupIntoLinks(links: readonly KmzLink[]): KmzLinkGroup[] {
  const licenseeKeys = new Map<string, number>();
  const directions = links.map((entry, position) => toLinkDirection(entry, position, licenseeKeys));

  return groupMicrowaveLinks(directions).map((link) => {
    const entries = [...link.directions].sort((a, b) => a.position - b.position).map(({ entry }) => entry);
    return { first: entries[0]!, entries, linkType: link.linkType, speeds: calculateLinkDirectionalSpeeds(link) };
  });
}

function regionCodeOf(link: KmzLink): string {
  return REGION_CODE_BY_PROVINCE.get(link.txProvince?.toLowerCase().trim() ?? "") ?? "UNKNOWN";
}

function speedTotal(direction: string, speed: number | null): string[] {
  return speed === null ? [] : [`<b>${direction}:</b> ${formatSpeed(speed)}`];
}

function equipmentLine(role: string, type: string | null, manufacturer: string | null): string[] {
  if (type === null) return [];
  return [`${role}: ${escapeXml(type)}${manufacturer === null ? "" : ` (${escapeXml(manufacturer)})`}`];
}

function endLine(role: string, city: string | null, street: string | null, latitude: number, longitude: number, height: number | null): string {
  return `<b>${role}:</b> ${city ?? ""} ${street ?? ""} (${latitude.toFixed(6)}, ${longitude.toFixed(6)}) H: ${height === null ? "-" : `${height}m`}`;
}

function linkDescription({ first, entries, linkType, speeds }: KmzLinkGroup): string {
  const distance = calculateDistance(first.txLatitude, first.txLongitude, first.rxLatitude, first.rxLongitude);
  const [forwardStart] = [txPosition(first), rxPosition(first)].sort();
  const directions: string[] = [];

  for (const entry of entries) {
    const isForward = txPosition(entry) === forwardStart;
    const parts = [isForward ? "A→B" : "B→A", formatFrequency(entry.freqKhz / 1000)];
    if (entry.polarization) parts.push(entry.polarization);
    if (entry.channelWidth) parts.push(`${entry.channelWidth} MHz`);
    if (entry.modulationType) parts.push(escapeXml(entry.modulationType));

    if (entry.channelWidth && entry.modulationType) {
      const speed = calculateMicrowaveLinkSpeed(entry.channelWidth, entry.modulationType);
      if (speed !== null) parts.push(formatSpeed(speed));
    } else if (entry.bandwidth) parts.push(formatBandwidth(entry.bandwidth));

    if (entry.eirp !== null) parts.push(`EIRP: ${entry.eirp} dBm`);
    directions.push(parts.join(" | "));
  }

  const speedTotals = [...speedTotal("Downlink", speeds.dl), ...speedTotal("Uplink", speeds.ul)];
  const equipment = [
    ...equipmentLine("TX Radio", first.transmitterType, first.transmitterManufacturer),
    ...equipmentLine("TX Antenna", first.txAntennaType, first.txAntennaManufacturer),
    ...equipmentLine("RX Antenna", first.rxAntennaType, first.rxAntennaManufacturer),
  ];

  const lines = [
    `<b>Operator:</b> ${escapeXml(first.licenseeName ?? "Unknown")}`,
    `<b>Permit:</b> ${escapeXml(first.permitNumber)}${first.decisionType === null ? "" : ` [${decisionCode(first.decisionType)}]`}`,
    `<b>Link Type:</b> ${linkType}`,
    `<b>Distance:</b> ${formatDistance(distance)}`,
  ];
  if (speedTotals.length > 0) lines.push(speedTotals.join("  "));
  lines.push(
    `<b>Expires:</b> ${first.expiresOn ?? "-"}`,
    "",
    endLine("TX", first.txCity, first.txStreet, first.txLatitude, first.txLongitude, first.txHeight),
    endLine("RX", first.rxCity, first.rxStreet, first.rxLatitude, first.rxLongitude, first.rxHeight),
    "",
    "<b>Directions:</b>",
    ...directions,
  );
  if (equipment.length > 0) lines.push("", "<b>Equipment:</b>", ...equipment);

  return lines.join("<br/>");
}

function licenseeStyleId(licenseeName: string): string {
  const slug = licenseeName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `line-op-${slug || "default"}`;
}

export function linksKml(groups: readonly KmzLinkGroup[], title: string): string {
  const placemarksByLicensee = new Map<string, Map<MicrowaveLinkType, string[]>>();
  const colorByStyleId = new Map<string, string>();

  for (const group of groups) {
    const { first, linkType } = group;
    const licenseeName = first.licenseeName ?? "Unknown";
    const styleId = licenseeStyleId(licenseeName);
    if (!colorByStyleId.has(styleId)) colorByStyleId.set(styleId, first.color ?? DEFAULT_OPERATOR_COLOR);

    const placemarksByType = placemarksByLicensee.get(licenseeName) ?? new Map<MicrowaveLinkType, string[]>();
    placemarksByLicensee.set(licenseeName, placemarksByType);
    bucketOf(placemarksByType, linkType).push(
      placemark(
        `${formatFrequency(first.freqKhz / 1000)} [${linkType}]`,
        linkDescription(group),
        `<LineString><coordinates>${first.txLongitude},${first.txLatitude},0 ${first.rxLongitude},${first.rxLatitude},0</coordinates></LineString>`,
        `#${styleId}`,
      ),
    );
  }

  const styles = [...colorByStyleId].map(([styleId, color]) => lineStyle(styleId, hexToKmlColor(color, "b3"), 2));
  const licenseeFolders = entriesSortedByKey(placemarksByLicensee).map(([licenseeName, placemarksByType]) => {
    const typeFolders = entriesSortedByKey(placemarksByType).map(([linkType, placemarks]) =>
      folder(`${linkType} (${placemarks.length})`, placemarks.join("\n"), true),
    );
    const linkCount = [...placemarksByType.values()].reduce((total, placemarks) => total + placemarks.length, 0);
    return folder(`${licenseeName} (${linkCount})`, typeFolders.join("\n"), false);
  });

  return wrapKml(title, `${styles.join("\n")}\n${licenseeFolders.join("\n")}`);
}

export function* linkDocuments(links: readonly KmzLink[], day: string): Generator<KmzDocument> {
  const groups = groupIntoLinks(links);
  yield { path: `radiolines_${day}.kmz`, kml: linksKml(groups, "Radiolinie UKE") };

  const groupsByRegion = new Map<string, KmzLinkGroup[]>();
  for (const group of groups) bucketOf(groupsByRegion, regionCodeOf(group.first)).push(group);
  for (const [regionCode, regionGroups] of entriesSortedByKey(groupsByRegion)) {
    yield { path: `radiolines_${day}_${regionCode}.kmz`, kml: linksKml(regionGroups, `Radiolinie UKE - ${regionCode}`) };
  }

  const newest = rowsCreatedOnNewestDay(links);
  if (newest) yield { path: `radiolines_new_${newest.day}.kmz`, kml: linksKml(groupIntoLinks(newest.rows), `Radiolinie UKE - nowe (${newest.day})`) };
}

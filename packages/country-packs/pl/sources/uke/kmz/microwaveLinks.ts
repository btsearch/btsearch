import { calculateDistance, formatDistance } from "@openbts/shared/geo";
import { calculateMicrowaveLinkSpeed, formatBandwidth, formatFrequency, formatSpeed } from "@openbts/shared/microwaveLinkUtils";
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

type LinkType = "FDD" | "2+0 FDD" | "XPIC" | "SD" | "UNKNOWN";
type KmzLinkGroup = { first: KmzLink; entries: KmzLink[]; linkType: LinkType };

function txPosition(link: KmzLink): string {
  return `${link.txLatitude},${link.txLongitude}`;
}

function rxPosition(link: KmzLink): string {
  return `${link.rxLatitude},${link.rxLongitude}`;
}

function linkGroupKey(link: KmzLink): string {
  const licenseeName = link.licenseeName ?? "unknown";
  if (link.permitNumber) return `permit:${licenseeName}::${link.permitNumber}`;

  const endsInFixedOrder = [txPosition(link), rxPosition(link)].sort();
  return `coords:${licenseeName}::${endsInFixedOrder.join("|")}`;
}

export function classifyLinkType(entries: readonly KmzLink[]): LinkType {
  const entriesByDirection = new Map<string, KmzLink[]>();
  for (const entry of entries) bucketOf(entriesByDirection, `${txPosition(entry)}->${rxPosition(entry)}`).push(entry);

  const busiestDirection = [...entriesByDirection.values()].reduce((busiest, direction) => (direction.length > busiest.length ? direction : busiest));
  if (busiestDirection.length === 1) return "FDD";

  const frequencies = new Set(busiestDirection.map((entry) => entry.freqKhz));
  const polarizations = new Set(busiestDirection.map((entry) => entry.polarization));
  if (frequencies.size === 1 && polarizations.size > 1) return "XPIC";
  if (frequencies.size > 1 && polarizations.size === 1) return "2+0 FDD";
  if (frequencies.size === 1 && polarizations.size === 1) return "SD";
  return "UNKNOWN";
}

export function groupIntoLinks(links: readonly KmzLink[]): KmzLinkGroup[] {
  const groups = new Map<string, { first: KmzLink; entries: KmzLink[] }>();
  for (const link of links) {
    const key = linkGroupKey(link);
    const group = groups.get(key);
    if (group) group.entries.push(link);
    else groups.set(key, { first: link, entries: [link] });
  }

  return [...groups.values()].map((group) => ({ ...group, linkType: classifyLinkType(group.entries) }));
}

function regionCodeOf(link: KmzLink): string {
  return REGION_CODE_BY_PROVINCE.get(link.txProvince?.toLowerCase().trim() ?? "") ?? "UNKNOWN";
}

function speedTotal(direction: string, speeds: readonly number[]): string[] {
  if (speeds.length === 0) return [];
  return [`<b>${direction}:</b> ${formatSpeed(speeds.reduce((total, speed) => total + speed, 0))}`];
}

function equipmentLine(role: string, type: string | null, manufacturer: string | null): string[] {
  if (type === null) return [];
  return [`${role}: ${escapeXml(type)}${manufacturer === null ? "" : ` (${escapeXml(manufacturer)})`}`];
}

function endLine(role: string, city: string | null, street: string | null, latitude: number, longitude: number, height: number | null): string {
  return `<b>${role}:</b> ${city ?? ""} ${street ?? ""} (${latitude.toFixed(6)}, ${longitude.toFixed(6)}) H: ${height === null ? "-" : `${height}m`}`;
}

function linkDescription({ first, entries, linkType }: KmzLinkGroup): string {
  const distance = calculateDistance(first.txLatitude, first.txLongitude, first.rxLatitude, first.rxLongitude);
  const [forwardStart] = [txPosition(first), rxPosition(first)].sort();
  const directions: string[] = [];
  const forwardSpeeds: number[] = [];
  const backwardSpeeds: number[] = [];

  for (const entry of entries) {
    const isForward = txPosition(entry) === forwardStart;
    const parts = [isForward ? "A→B" : "B→A", formatFrequency(entry.freqKhz / 1000)];
    if (entry.polarization) parts.push(entry.polarization);
    if (entry.channelWidth) parts.push(`${entry.channelWidth} MHz`);
    if (entry.modulationType) parts.push(escapeXml(entry.modulationType));

    if (entry.channelWidth && entry.modulationType) {
      const speed = calculateMicrowaveLinkSpeed(entry.channelWidth, entry.modulationType);
      if (speed !== null) {
        parts.push(formatSpeed(speed));
        (isForward ? forwardSpeeds : backwardSpeeds).push(speed);
      }
    } else if (entry.bandwidth) parts.push(formatBandwidth(entry.bandwidth));

    if (entry.eirp !== null) parts.push(`EIRP: ${entry.eirp} dBm`);
    directions.push(parts.join(" | "));
  }

  const speedTotals = [...speedTotal("Downlink", forwardSpeeds), ...speedTotal("Uplink", backwardSpeeds)];
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
  const placemarksByLicensee = new Map<string, Map<LinkType, string[]>>();
  const colorByStyleId = new Map<string, string>();

  for (const group of groups) {
    const { first, linkType } = group;
    const licenseeName = first.licenseeName ?? "Unknown";
    const styleId = licenseeStyleId(licenseeName);
    if (!colorByStyleId.has(styleId)) colorByStyleId.set(styleId, first.color ?? DEFAULT_OPERATOR_COLOR);

    const placemarksByType = placemarksByLicensee.get(licenseeName) ?? new Map<LinkType, string[]>();
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

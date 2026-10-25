import type {
  Band,
  Brand,
  Licensee,
  MicrowaveLink,
  ObservedCellRecord,
  OfficialSite,
  OfficialSitePermit,
  StationCell,
} from "@openbts/shared/contract";
import { calculateBearing, calculateDistance, destinationPoint, formatDistance } from "@openbts/shared/geo";
import { calculateMicrowaveLinkSpeed, formatBandwidth, formatFrequency, formatSpeed, getModulationBits } from "@openbts/shared/microwaveLinkUtils";

import type { MapLookups } from "./data/mapLookups";
import { toOfficialRatFilter, toOfficialRatOption } from "@/features/official/labels";
import { toRatType } from "@/features/station-details/station/utils/bands";
import { findBrand, getBrandColor } from "@/features/station-details/station/utils/brands";
import { isPermitExpired } from "@/lib/dateUtils";
import type { Cell } from "@/types/station";

export {
  calculateBearing,
  calculateDistance,
  calculateMicrowaveLinkSpeed,
  destinationPoint,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
  getModulationBits,
};

import { RAT_ORDER } from "./constants";

const TA_STEP = {
  GSM: 554, // ~554 m per step
  UMTS: 39.0625, // ~39.06 m per chip (one-way)
  LTE: 78.125, // ~78.12 m per step
  NR_30KHZ: 39.0625, // ~39.06 m per step (SCS 30 kHz)
} as const;

export type MicrowaveLinkType = "FDD" | "2+0 FDD" | "XPIC" | "SD" | "UNKNOWN";

export type MicrowaveLinkLookups = Pick<MapLookups, "brands" | "operatorsById">;

export type DuplexMicrowaveLink = {
  groupId: string;
  a: { latitude: number; longitude: number };
  b: { latitude: number; longitude: number };
  directions: MicrowaveLink[];
  linkType: MicrowaveLinkType;
  isExpired: boolean;
};

function ratOrder(rat: string): number {
  const index = RAT_ORDER.indexOf(rat.toUpperCase() as (typeof RAT_ORDER)[number]);
  return index === -1 ? 999 : index;
}

const BAND_REGEX = /^([A-Za-z]+(?:-[A-Za-z]+)?)(\d+)$/;

function sortBands(bands: string[]): string[] {
  return [...bands].sort((a, b) => {
    const matchA = a.match(BAND_REGEX);
    const matchB = b.match(BAND_REGEX);

    if (!matchA || !matchB) return a.localeCompare(b);

    const orderDiff = ratOrder(matchA[1]) - ratOrder(matchB[1]);
    if (orderDiff !== 0) return orderDiff;

    return Number.parseInt(matchA[2], 10) - Number.parseInt(matchB[2], 10);
  });
}

export function getStationBands(cells: Cell[]): string[] {
  return sortBands([...new Set(cells.map((c) => `${c.rat}${c.band.value ?? ""}`))]);
}

export function getCellTechnologyBands(cells: readonly StationCell[]): string[] {
  return sortBands([...new Set(cells.map((cell) => `${toRatType(cell.rat)}${cell.band?.labelMhz ?? ""}`))]);
}

export function getObservedCellTechnologyBands(cells: readonly ObservedCellRecord[], bandsById: ReadonlyMap<number, Band> | undefined): string[] {
  const bands = cells.map((cell) => {
    const band = cell.bandId === null ? undefined : bandsById?.get(cell.bandId);
    return `${toRatType(cell.rat)}${band?.labelMhz ?? ""}`;
  });
  return sortBands([...new Set(bands)]);
}

export function getOfficialPermitBands(permits: readonly Pick<OfficialSitePermit, "label">[]): string[] {
  const bands = permits.flatMap(({ label }) => {
    const rat = toOfficialRatFilter(label);
    if (rat === null) return [];
    return [`${toOfficialRatOption(rat).label.toUpperCase()}${label.labelMhz ?? ""}`];
  });
  return sortBands([...new Set(bands)]);
}

export function getLicenseeBrand(
  licensee: Pick<Licensee, "operatorId" | "brandId"> | null | undefined,
  lookups: MicrowaveLinkLookups | undefined,
): Brand | null {
  if (lookups === undefined || licensee === null || licensee === undefined) return null;
  if (licensee.operatorId !== null) return lookups.operatorsById.get(licensee.operatorId)?.brand ?? null;
  return findBrand(lookups.brands, licensee.brandId);
}

export function getMicrowaveLinkLook(link: DuplexMicrowaveLink, lookups: MicrowaveLinkLookups | undefined): { brand: Brand | null; color: string } {
  const brand = getLicenseeBrand(link.directions[0].licensee, lookups);
  return { brand, color: getBrandColor(brand) };
}

export function isOfficialSiteExpired(site: Pick<OfficialSite, "permits">): boolean {
  const permits = site.permits ?? [];
  return permits.length > 0 && permits.every((permit) => permit.expiresOn !== null && isPermitExpired(permit.expiresOn));
}

export function calculateLinkDirectionalSpeeds(link: DuplexMicrowaveLink): { dl: number | null; ul: number | null } {
  const aKey = `${link.a.latitude},${link.a.longitude}`;
  let dl: number | null = null;
  let ul: number | null = null;

  for (const dir of link.directions) {
    const speed = dir.channelWidthMhz && dir.modulation ? calculateMicrowaveLinkSpeed(dir.channelWidthMhz, dir.modulation) : null;
    if (speed === null) continue;
    const isForward = `${dir.tx.latitude},${dir.tx.longitude}` === aKey;
    if (isForward) dl = (dl ?? 0) + speed;
    else ul = (ul ?? 0) + speed;
  }

  return { dl, ul };
}

export function buildMicrowaveLinkShareUrl(link: DuplexMicrowaveLink): string {
  const distance = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
  const zoom = Math.max(8, Math.min(14, Math.round(14.5 - Math.log2(distance / 1000))));
  const lat = ((link.a.latitude + link.b.latitude) / 2).toFixed(6);
  const lng = ((link.a.longitude + link.b.longitude) / 2).toFixed(6);
  return `${window.location.origin}/#map=${zoom}/${lat}/${lng}~fr~R${link.directions[0].id}`;
}

const LINK_TYPE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  FDD: { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
  "2+0 FDD": { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
  XPIC: { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/20" },
  SD: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border/50" },
};

export function getLinkTypeStyle(linkType: MicrowaveLinkType): { bg: string; text: string; border: string } | null {
  return LINK_TYPE_STYLES[linkType] ?? null;
}

export function endpointPairKey(link: MicrowaveLink): string {
  const a = `${link.tx.latitude},${link.tx.longitude}`;
  const b = `${link.rx.latitude},${link.rx.longitude}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function txRxDirectionKey(link: MicrowaveLink): string {
  return `${link.tx.latitude},${link.tx.longitude}→${link.rx.latitude},${link.rx.longitude}`;
}

function classifyLinkType(entries: MicrowaveLink[]): MicrowaveLinkType {
  const byDirection = new Map<string, MicrowaveLink[]>();
  for (const e of entries) {
    const key = txRxDirectionKey(e);
    const group = byDirection.get(key);
    if (group) group.push(e);
    else byDirection.set(key, [e]);
  }

  const ref = [...byDirection.values()].reduce((a, b) => (a.length >= b.length ? a : b));
  if (ref.length === 1) return "FDD";

  const freqs = new Set(ref.map((e) => e.frequencyMhz));
  const pols = new Set(ref.map((e) => e.polarization));

  if (freqs.size === 1 && pols.size > 1) return "XPIC";
  if (freqs.size > 1 && pols.size === 1) return "2+0 FDD";
  if (freqs.size === 1 && pols.size === 1) return "SD";
  return "UNKNOWN";
}

function interleave<T>(a: T[], b: T[]): T[] {
  const result: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) result.push(a[i]);
    if (i < b.length) result.push(b[i]);
  }
  return result;
}

export function groupMicrowaveLinksIntoDuplexLinks(microwaveLinks: MicrowaveLink[]): DuplexMicrowaveLink[] {
  const groups = new Map<string, MicrowaveLink[]>();

  for (const link of microwaveLinks) {
    const licenseeKey = link.licenseeId ?? "unknown";
    const key = link.permit.number ? `permit:${licenseeKey}::${link.permit.number}` : `coords:${licenseeKey}::${endpointPairKey(link)}`;

    const group = groups.get(key);
    if (group) group.push(link);
    else groups.set(key, [link]);
  }

  return [...groups.entries()].map(([key, entries]) => {
    const linkType = classifyLinkType(entries);

    const first = entries[0];
    const p1 = { latitude: first.tx.latitude, longitude: first.tx.longitude };
    const p2 = { latitude: first.rx.latitude, longitude: first.rx.longitude };

    const p1Key = `${p1.latitude},${p1.longitude}`;
    const p2Key = `${p2.latitude},${p2.longitude}`;
    const [a, b] = p1Key <= p2Key ? [p1, p2] : [p2, p1];
    const aKey = `${a.latitude},${a.longitude}`;

    const pairSortKey = (e: MicrowaveLink) => `${e.polarization ?? ""}:${e.frequencyMhz}`;
    const sorted = (lines: MicrowaveLink[]) => [...lines].sort((x, y) => pairSortKey(x).localeCompare(pairSortKey(y)));

    const forward = sorted(entries.filter((e) => `${e.tx.latitude},${e.tx.longitude}` === aKey));
    const reverse = sorted(entries.filter((e) => `${e.tx.latitude},${e.tx.longitude}` !== aKey));

    const directions = linkType === "XPIC" ? [...forward, ...reverse] : interleave(forward, reverse);

    return {
      groupId: key,
      a,
      b,
      directions,
      linkType,
      isExpired: entries.some((d) => d.permit.expiresOn !== null && isPermitExpired(d.permit.expiresOn)),
    };
  });
}

export function findDuplexLinkByMicrowaveLinkId(microwaveLinkId: number, links: DuplexMicrowaveLink[]): DuplexMicrowaveLink | undefined {
  return links.find((link) => link.directions.some((d) => d.id === microwaveLinkId));
}

export function calculateTA(distanceMeters: number) {
  return {
    gsm: Math.max(0, Math.round(distanceMeters / TA_STEP.GSM)),
    umts: Math.max(0, Math.round(distanceMeters / TA_STEP.UMTS)),
    lte: Math.max(0, Math.round(distanceMeters / TA_STEP.LTE)),
    nr: Math.max(0, Math.round(distanceMeters / TA_STEP.NR_30KHZ)),
  };
}

import {
  calculateBearing,
  calculateDistance,
  calculateRadiolineSpeed,
  destinationPoint,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
  getModulationBits,
} from "@openbts/shared/radiolinesUtils";

import { isPermitExpired } from "@/lib/dateUtils";
import type { Cell, LocationInfo, RadioLine, UkeLocationWithPermits, UkePermit, UkeStation } from "@/types/station";

export {
  calculateBearing,
  calculateDistance,
  calculateRadiolineSpeed,
  destinationPoint,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
  getModulationBits,
};

import { RAT_ORDER } from "./constants";

export function toLocationInfo(loc: {
  id: number;
  city?: string;
  address?: string;
  latitude: number;
  longitude: number;
  region?: { name: string };
}): LocationInfo {
  return { id: loc.id, city: loc.city, address: loc.address, region: loc.region?.name, latitude: loc.latitude, longitude: loc.longitude };
}

const TA_STEP = {
  GSM: 554, // ~554 m per step
  UMTS: 78.125, // ~78.12 m per chip (one-way)
  LTE: 78.125, // ~78.12 m per step
  NR_30KHZ: 39.0625, // ~39.06 m per step (SCS 30 kHz)
} as const;

export type RadioLinkType = "FDD" | "2+0 FDD" | "XPIC" | "SD" | "UNKNOWN";

export type DuplexRadioLink = {
  groupId: string;
  a: { latitude: number; longitude: number };
  b: { latitude: number; longitude: number };
  directions: RadioLine[];
  linkType: RadioLinkType;
  isExpired: boolean;
};

export function groupPermitsByStation(permits: UkePermit[], ukeLocation?: UkeLocationWithPermits): UkeStation[] {
  const stationMap = new Map<string, UkeStation>();

  const overrideLocation = ukeLocation
    ? {
        id: ukeLocation.id,
        city: ukeLocation.city,
        address: ukeLocation.address,
        latitude: ukeLocation.latitude,
        longitude: ukeLocation.longitude,
        region: ukeLocation.region,
      }
    : null;

  for (const permit of permits) {
    const existing = stationMap.get(permit.station_id);
    if (existing) {
      existing.permits.push(permit);
    } else {
      stationMap.set(permit.station_id, {
        station_id: permit.station_id,
        operator: permit.operator ?? null,
        permits: [permit],
        location: overrideLocation ?? permit.location ?? null,
      });
    }
  }

  return Array.from(stationMap.values());
}

function ratOrder(rat: string): number {
  const index = RAT_ORDER.indexOf(rat.toUpperCase() as (typeof RAT_ORDER)[number]);
  return index === -1 ? 999 : index;
}

const BAND_REGEX = /^([A-Za-z]+(?:-[A-Za-z]+)?)(\d+)$/;

function sortBands(bands: string[]): string[] {
  return bands.sort((a, b) => {
    const matchA = a.match(BAND_REGEX);
    const matchB = b.match(BAND_REGEX);

    if (!matchA || !matchB) return a.localeCompare(b);

    const orderDiff = ratOrder(matchA[1]) - ratOrder(matchB[1]);
    if (orderDiff !== 0) return orderDiff;

    return Number.parseInt(matchA[2], 10) - Number.parseInt(matchB[2], 10);
  });
}

export function getStationBands(cells: Cell[]): string[] {
  return sortBands([...new Set(cells.map((c) => `${c.rat}${c.band.value}`))]);
}

export function getPermitBands(permits: UkePermit[]): string[] {
  const bands = permits.reduce<string[]>((acc, p) => {
    if (!p.band) return acc;
    const rat = p.band.rat === "GSM" && p.band.variant === "railway" ? "GSM-R" : p.band.rat;
    acc.push(`${rat}${p.band.value}`);
    return acc;
  }, []);
  return sortBands([...new Set(bands)]);
}

export function calculateLinkDirectionalSpeeds(link: DuplexRadioLink): { dl: number | null; ul: number | null } {
  const aKey = `${link.a.latitude},${link.a.longitude}`;
  let dl: number | null = null;
  let ul: number | null = null;

  for (const dir of link.directions) {
    const speed = dir.link.ch_width && dir.link.modulation_type ? calculateRadiolineSpeed(dir.link.ch_width, dir.link.modulation_type) : null;
    if (speed === null) continue;
    const isForward = `${dir.tx.latitude},${dir.tx.longitude}` === aKey;
    if (isForward) dl = (dl ?? 0) + speed;
    else ul = (ul ?? 0) + speed;
  }

  return { dl, ul };
}

export function buildRadiolineShareUrl(link: DuplexRadioLink): string {
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

export function getLinkTypeStyle(linkType: RadioLinkType): { bg: string; text: string; border: string } | null {
  return LINK_TYPE_STYLES[linkType] ?? null;
}

function endpointPairKey(rl: RadioLine): string {
  const a = `${rl.tx.latitude},${rl.tx.longitude}`;
  const b = `${rl.rx.latitude},${rl.rx.longitude}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function txRxDirectionKey(rl: RadioLine): string {
  return `${rl.tx.latitude},${rl.tx.longitude}→${rl.rx.latitude},${rl.rx.longitude}`;
}

function classifyLinkType(entries: RadioLine[]): RadioLinkType {
  const byDirection = new Map<string, RadioLine[]>();
  for (const e of entries) {
    const key = txRxDirectionKey(e);
    const group = byDirection.get(key);
    if (group) group.push(e);
    else byDirection.set(key, [e]);
  }

  const ref = [...byDirection.values()].reduce((a, b) => (a.length >= b.length ? a : b));
  if (ref.length === 1) return "FDD";

  const freqs = new Set(ref.map((e) => e.link.freq));
  const pols = new Set(ref.map((e) => e.link.polarization));

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

export function groupRadioLinesIntoLinks(radioLines: RadioLine[]): DuplexRadioLink[] {
  const groups = new Map<string, RadioLine[]>();

  for (const rl of radioLines) {
    const opId = rl.operator?.id ?? "unknown";
    const key = rl.permit.number ? `permit:${opId}::${rl.permit.number}` : `coords:${opId}::${endpointPairKey(rl)}`;

    const group = groups.get(key);
    if (group) group.push(rl);
    else groups.set(key, [rl]);
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

    const pairSortKey = (e: RadioLine) => `${e.link.polarization ?? ""}:${e.link.freq}`;
    const sorted = (lines: RadioLine[]) => lines.sort((x, y) => pairSortKey(x).localeCompare(pairSortKey(y)));

    const forward = sorted(entries.filter((e) => `${e.tx.latitude},${e.tx.longitude}` === aKey));
    const reverse = sorted(entries.filter((e) => `${e.tx.latitude},${e.tx.longitude}` !== aKey));

    const directions = linkType === "XPIC" ? [...forward, ...reverse] : interleave(forward, reverse);

    return {
      groupId: key,
      a,
      b,
      directions,
      linkType,
      isExpired: entries.some((d) => isPermitExpired(d.permit.expiry_date)),
    };
  });
}

export function findDuplexLinkByRadioLineId(radioLineId: number, links: DuplexRadioLink[]): DuplexRadioLink | undefined {
  return links.find((link) => link.directions.some((d) => d.id === radioLineId));
}

export function calculateTA(distanceMeters: number) {
  return {
    gsm: Math.max(0, Math.round(distanceMeters / TA_STEP.GSM)),
    umts: Math.max(0, Math.round(distanceMeters / TA_STEP.UMTS)),
    lte: Math.max(0, Math.round(distanceMeters / TA_STEP.LTE)),
    nr: Math.max(0, Math.round(distanceMeters / TA_STEP.NR_30KHZ)),
  };
}

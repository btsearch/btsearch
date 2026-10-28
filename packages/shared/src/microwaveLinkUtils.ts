type MicrowaveLinkEnd = { latitude: number; longitude: number };

export type MicrowaveLinkDirection = {
  licenseeId: number | null;
  permit: { number: string | null };
  tx: MicrowaveLinkEnd;
  rx: MicrowaveLinkEnd;
  frequencyMhz: number;
  polarization: string | null;
  channelWidthMhz: number | null;
  modulation: string | null;
};

export const MICROWAVE_LINK_TYPES = ["FDD", "2+0 FDD", "XPIC", "2+0 XPIC", "SD"] as const;
export type MicrowaveLinkType = (typeof MICROWAVE_LINK_TYPES)[number] | "UNKNOWN";

export type GroupedMicrowaveLink<Direction extends MicrowaveLinkDirection> = {
  groupId: string;
  a: MicrowaveLinkEnd;
  b: MicrowaveLinkEnd;
  directions: Direction[];
  linkType: MicrowaveLinkType;
};

export type MicrowaveLinkSpeeds = { dl: number | null; ul: number | null };

export function formatFrequency(freqMhz: number): string {
  if (freqMhz < 1000) return `${freqMhz} MHz`;
  const ghz = freqMhz / 1000;
  return `${Number.isInteger(ghz) ? ghz : ghz.toFixed(1)} GHz`;
}

export function formatSpeed(mbps: number): string {
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(2)} Gbps` : `${Math.round(mbps)} Mbps`;
}

export function formatBandwidth(bandwidth: string): string {
  const num = Number(bandwidth);
  if (Number.isNaN(num)) return bandwidth;
  return num >= 1000 ? `${(num / 1000).toFixed(2)} Gbps` : `${num} Mbps`;
}

const MODULATION_NORMALIZE_REGEX = /[\s\-_]/g;
const QAM_REGEX = /(\d+)QAM/;

const MODULATION_BITS: Record<string, number> = {
  BPSK: 1,
  QPSK: 2,
  "4QAM": 2,
  "8QAM": 3,
  "16QAM": 4,
  "32QAM": 5,
  "64QAM": 6,
  "128QAM": 7,
  "256QAM": 8,
  "512QAM": 9,
  "1024QAM": 10,
  "2048QAM": 11,
  "4096QAM": 12,
};

export function getModulationBits(modulationType: string): number | null {
  const normalized = modulationType.toUpperCase().replace(MODULATION_NORMALIZE_REGEX, "");
  const knownBits = MODULATION_BITS[normalized];
  if (knownBits !== undefined) return knownBits;
  if (normalized.includes("QPSK")) return 2;
  if (normalized.includes("BPSK")) return 1;
  const match = normalized.match(QAM_REGEX);
  if (match) {
    const bits = Math.log2(Number.parseInt(match[1]!, 10));
    if (Number.isInteger(bits) && bits >= 1 && bits <= 14) return bits;
  }
  return null;
}

export function calculateMicrowaveLinkSpeed(chWidth: number, modulationType: string): number | null {
  const bits = getModulationBits(modulationType);
  return bits === null ? null : chWidth * bits * 0.85;
}

function positionKey({ latitude, longitude }: MicrowaveLinkEnd): string {
  return `${latitude},${longitude}`;
}

function addTo<Key, Value>(groups: Map<Key, Value[]>, key: Key, value: Value): void {
  const group = groups.get(key);
  if (group) group.push(value);
  else groups.set(key, [value]);
}

export function calculateLinkDirectionalSpeeds(
  link: Pick<GroupedMicrowaveLink<MicrowaveLinkDirection>, "a" | "directions" | "linkType">,
): MicrowaveLinkSpeeds {
  const aKey = positionKey(link.a);
  const combine = link.linkType === "SD" ? Math.max : (total: number, speed: number) => total + speed;
  let dl: number | null = null;
  let ul: number | null = null;

  for (const dir of link.directions) {
    const speed = dir.channelWidthMhz && dir.modulation ? calculateMicrowaveLinkSpeed(dir.channelWidthMhz, dir.modulation) : null;
    if (speed === null) continue;
    if (positionKey(dir.tx) === aKey) dl = dl === null ? speed : combine(dl, speed);
    else ul = ul === null ? speed : combine(ul, speed);
  }

  return { dl, ul };
}

export function endpointPairKey(link: Pick<MicrowaveLinkDirection, "tx" | "rx">): string {
  const a = positionKey(link.tx);
  const b = positionKey(link.rx);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function hasBothPolarizations(polarizations: readonly (string | null)[]): boolean {
  return polarizations.length === 2 && new Set(polarizations).size === 2;
}

function classifyLinkType(entries: readonly MicrowaveLinkDirection[]): MicrowaveLinkType {
  const entriesByDirection = new Map<string, MicrowaveLinkDirection[]>();
  for (const entry of entries) addTo(entriesByDirection, `${positionKey(entry.tx)}→${positionKey(entry.rx)}`, entry);

  const busiestDirection = [...entriesByDirection.values()].reduce((busiest, direction) => (direction.length > busiest.length ? direction : busiest));
  if (busiestDirection.length === 1) return "FDD";

  const polarizationsByFrequency = new Map<number, (string | null)[]>();
  for (const entry of busiestDirection) addTo(polarizationsByFrequency, entry.frequencyMhz, entry.polarization);
  const frequencies = [...polarizationsByFrequency.values()];

  if (frequencies.length === 1) return new Set(frequencies[0]).size > 1 ? "XPIC" : "SD";
  if (frequencies.every((polarizations) => polarizations.length === 1)) return "2+0 FDD";
  if (frequencies.length === 2 && frequencies.every(hasBothPolarizations)) return "2+0 XPIC";
  return "UNKNOWN";
}

function interleave<T>(a: T[], b: T[]): T[] {
  const result: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) result.push(a[i]!);
    if (i < b.length) result.push(b[i]!);
  }
  return result;
}

function compareChannels(x: MicrowaveLinkDirection, y: MicrowaveLinkDirection): number {
  return `${x.polarization ?? ""}:${x.frequencyMhz}`.localeCompare(`${y.polarization ?? ""}:${y.frequencyMhz}`);
}

export function groupMicrowaveLinks<Direction extends MicrowaveLinkDirection>(
  microwaveLinks: readonly Direction[],
): GroupedMicrowaveLink<Direction>[] {
  const groups = new Map<string, Direction[]>();
  for (const link of microwaveLinks) {
    const licenseeKey = link.licenseeId ?? "unknown";
    const key = link.permit.number ? `permit:${licenseeKey}::${link.permit.number}` : `coords:${licenseeKey}::${endpointPairKey(link)}`;
    addTo(groups, key, link);
  }

  return [...groups.entries()].map(([groupId, entries]) => {
    const linkType = classifyLinkType(entries);
    const { tx, rx } = entries[0]!;
    const txEnd = { latitude: tx.latitude, longitude: tx.longitude };
    const rxEnd = { latitude: rx.latitude, longitude: rx.longitude };
    const [a, b] = positionKey(txEnd) <= positionKey(rxEnd) ? [txEnd, rxEnd] : [rxEnd, txEnd];
    const aKey = positionKey(a);

    const forward = entries.filter((entry) => positionKey(entry.tx) === aKey).sort(compareChannels);
    const reverse = entries.filter((entry) => positionKey(entry.tx) !== aKey).sort(compareChannels);
    const directions = linkType === "XPIC" ? [...forward, ...reverse] : interleave(forward, reverse);

    return { groupId, a, b, directions, linkType };
  });
}

export const MICROWAVE_LINK_OTHER_BUCKET = "other";

export const MICROWAVE_LINK_BANDS = [
  { key: "6", fromMhz: 5850, toMhz: 7125 },
  { key: "7", fromMhz: 7125, toMhz: 7900 },
  { key: "8", fromMhz: 7900, toMhz: 8500 },
  { key: "10", fromMhz: 10_000, toMhz: 10_700 },
  { key: "11", fromMhz: 10_700, toMhz: 11_700 },
  { key: "13", fromMhz: 12_750, toMhz: 13_250 },
  { key: "15", fromMhz: 14_400, toMhz: 15_350 },
  { key: "18", fromMhz: 17_700, toMhz: 19_700 },
  { key: "23", fromMhz: 21_200, toMhz: 23_600 },
  { key: "26", fromMhz: 24_250, toMhz: 26_500 },
  { key: "28", fromMhz: 27_500, toMhz: 29_500 },
  { key: "32", fromMhz: 31_800, toMhz: 33_400 },
  { key: "38", fromMhz: 37_000, toMhz: 39_500 },
  { key: "42", fromMhz: 40_500, toMhz: 43_500 },
  { key: "60", fromMhz: 57_000, toMhz: 66_000 },
  { key: "70/80", fromMhz: 71_000, toMhz: 86_000 },
] as const;

export const MICROWAVE_LINK_LENGTH_BUCKETS = [
  { key: "<1", belowMeters: 1000 },
  { key: "1-3", belowMeters: 3000 },
  { key: "3-5", belowMeters: 5000 },
  { key: "5-10", belowMeters: 10_000 },
  { key: "10-20", belowMeters: 20_000 },
  { key: ">=20", belowMeters: Number.POSITIVE_INFINITY },
] as const;

export const MICROWAVE_LINK_CAPACITY_BUCKETS = [
  { key: "<512", belowMbps: 512 },
  { key: "512-1000", belowMbps: 1000 },
  { key: "1000-2000", belowMbps: 2000 },
  { key: "2000-5000", belowMbps: 5000 },
  { key: "5000-10000", belowMbps: 10_000 },
  { key: ">=10000", belowMbps: Number.POSITIVE_INFINITY },
] as const;

export const MICROWAVE_LINK_BUCKETS = {
  band: [...MICROWAVE_LINK_BANDS.map(({ key }) => key), MICROWAVE_LINK_OTHER_BUCKET],
  length: MICROWAVE_LINK_LENGTH_BUCKETS.map(({ key }) => key),
  type: [...MICROWAVE_LINK_TYPES, MICROWAVE_LINK_OTHER_BUCKET],
  capacity: MICROWAVE_LINK_CAPACITY_BUCKETS.map(({ key }) => key),
};

export function getMicrowaveLinkBandBucket(frequencyMhz: number): string {
  return MICROWAVE_LINK_BANDS.find(({ fromMhz, toMhz }) => frequencyMhz >= fromMhz && frequencyMhz < toMhz)?.key ?? MICROWAVE_LINK_OTHER_BUCKET;
}

export function getMicrowaveLinkLengthBucket(meters: number): string {
  return MICROWAVE_LINK_LENGTH_BUCKETS.find(({ belowMeters }) => meters < belowMeters)!.key;
}

export function getMicrowaveLinkTypeBucket(linkType: MicrowaveLinkType): string {
  return linkType === "UNKNOWN" ? MICROWAVE_LINK_OTHER_BUCKET : linkType;
}

export function getMicrowaveLinkCapacityBucket(mbps: number): string {
  return MICROWAVE_LINK_CAPACITY_BUCKETS.find(({ belowMbps }) => mbps < belowMbps)!.key;
}

const MICROWAVE_LINK_VENDOR_NAMES: Record<string, string> = {
  huawei: "Huawei",
  ericsson: "Ericsson",
  nec: "NEC",
  ceragon: "Ceragon",
  zte: "ZTE",
  aviat: "Aviat",
  siae: "SIAE",
  nokia: "Nokia",
  siklu: "Siklu",
  "alcatel lucent": "Alcatel-Lucent",
  sagem: "Sagem",
  intracom: "Intracom",
  nera: "Nera",
  alcoma: "Alcoma",
  dragonwave: "DragonWave",
  saf: "SAF Tehnika",
};

const VENDOR_SEPARATOR_REGEX = /[^\p{L}\p{N}]+/gu;
const WHITESPACE_REGEX = /\s+/g;

export function getMicrowaveLinkVendor(manufacturer: string): string | null {
  const normalized = manufacturer.toLowerCase().replace(VENDOR_SEPARATOR_REGEX, " ").trim();
  const alias = Object.keys(MICROWAVE_LINK_VENDOR_NAMES).find((key) => normalized === key || normalized.startsWith(`${key} `));
  if (alias !== undefined) return MICROWAVE_LINK_VENDOR_NAMES[alias]!;

  const tidied = manufacturer.trim().replace(WHITESPACE_REGEX, " ");
  return tidied === "" ? null : tidied;
}

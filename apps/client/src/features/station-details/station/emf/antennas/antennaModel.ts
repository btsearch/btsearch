import type { EmfAntenna, EmfAntennaBand } from "../types";

type AntennaGroupKind = "azimuth" | "omnidirectional" | "undirected";
type BandRat = EmfAntennaBand["rat"];
export type TiltRange = NonNullable<EmfAntennaBand["tiltRange"]>;

type AntennaEntry = {
  key: string;
  position: number;
  antenna: EmfAntenna;
};

export type AntennaGroup = {
  key: string;
  kind: AntennaGroupKind;
  azimuth: number | null;
  entries: AntennaEntry[];
  frequencies: number[];
};

export type BandLine = {
  key: string;
  bands: EmfAntennaBand[];
  measuredTilt: number | null;
  tiltRange: TiltRange | null;
};

type BandCluster = { rat: BandRat; frequencies: number[] };
type BandEirp = { frequencyMhz: number; eirpWatts: number };
export type HeightLevel = { heightMeters: number; antennaCount: number };
export type TiltScale = { low: number; high: number };

const OMNIDIRECTIONAL_AZIMUTH = 360;
const GROUP_KIND_ORDER: Record<AntennaGroupKind, number> = { azimuth: 0, omnidirectional: 1, undirected: 2 };
const UNNUMBERED_ROW = Number.MAX_SAFE_INTEGER;
const TILT_SCALE_HIGHEST_LOW = 0;
const TILT_SCALE_LOWEST_HIGH = 1;

export function getAntennaGroupKind(azimuth: number | null): AntennaGroupKind {
  if (azimuth === null) return "undirected";
  return azimuth === OMNIDIRECTIONAL_AZIMUTH ? "omnidirectional" : "azimuth";
}

function getGroupKey(azimuth: number | null): string {
  const kind = getAntennaGroupKind(azimuth);
  return kind === "azimuth" ? `azimuth:${azimuth}` : kind;
}

function compareEntries(left: AntennaEntry, right: AntennaEntry): number {
  return (
    right.antenna.heightMeters - left.antenna.heightMeters ||
    (left.antenna.rowNumber ?? UNNUMBERED_ROW) - (right.antenna.rowNumber ?? UNNUMBERED_ROW) ||
    left.position - right.position
  );
}

function compareGroups(left: AntennaGroup, right: AntennaGroup): number {
  return GROUP_KIND_ORDER[left.kind] - GROUP_KIND_ORDER[right.kind] || (left.azimuth ?? 0) - (right.azimuth ?? 0);
}

export function listBandFrequencies(bands: readonly EmfAntennaBand[]): number[] {
  return [...new Set(bands.map((band) => band.frequencyMhz))].sort((left, right) => left - right);
}

function toAntennaGroup(key: string, entries: readonly AntennaEntry[]): AntennaGroup {
  const { azimuth } = entries[0].antenna;
  const kind = getAntennaGroupKind(azimuth);

  return {
    key,
    kind,
    azimuth: kind === "azimuth" ? azimuth : null,
    entries: [...entries].sort(compareEntries),
    frequencies: listBandFrequencies(entries.flatMap((entry) => entry.antenna.bands)),
  };
}

function getBandLineKey(band: EmfAntennaBand): string {
  const range = band.tiltRange === null ? "none" : `${band.tiltRange.min}:${band.tiltRange.max}`;
  return `${band.measuredTilt ?? "none"}|${range}`;
}

function listTiltValues(band: EmfAntennaBand): number[] {
  const rangeBounds = band.tiltRange === null ? [] : [band.tiltRange.min, band.tiltRange.max];
  return band.measuredTilt === null ? rangeBounds : [...rangeBounds, band.measuredTilt];
}

function listAntennaEntries(antennas: readonly EmfAntenna[]): AntennaEntry[] {
  return antennas.map((antenna, position) => ({ key: `${antenna.pageNumber}:${antenna.rowNumber ?? "-"}:${position}`, position, antenna }));
}

export function groupAntennasByAzimuth(antennas: readonly EmfAntenna[]): AntennaGroup[] {
  const entriesByGroup = new Map<string, AntennaEntry[]>();
  for (const entry of listAntennaEntries(antennas)) {
    const groupKey = getGroupKey(entry.antenna.azimuth);
    const groupEntries = entriesByGroup.get(groupKey);
    if (groupEntries) groupEntries.push(entry);
    else entriesByGroup.set(groupKey, [entry]);
  }

  return [...entriesByGroup.entries()].map(([key, groupEntries]) => toAntennaGroup(key, groupEntries)).sort(compareGroups);
}

export function listHeightLevels(antennas: readonly EmfAntenna[]): HeightLevel[] {
  const antennaCounts = new Map<number, number>();
  for (const antenna of antennas) antennaCounts.set(antenna.heightMeters, (antennaCounts.get(antenna.heightMeters) ?? 0) + 1);

  return [...antennaCounts.entries()]
    .map(([heightMeters, antennaCount]) => ({ heightMeters, antennaCount }))
    .sort((left, right) => right.heightMeters - left.heightMeters);
}

export function getTiltScale(antennas: readonly EmfAntenna[]): TiltScale {
  const tilts = antennas.flatMap((antenna) => antenna.bands.flatMap((band) => listTiltValues(band)));
  return { low: Math.min(TILT_SCALE_HIGHEST_LOW, ...tilts), high: Math.max(TILT_SCALE_LOWEST_HIGH, ...tilts) };
}

export function getTiltPosition(tilt: number, scale: TiltScale): number {
  return (tilt - scale.low) / (scale.high - scale.low);
}

export function listBandLines(antenna: EmfAntenna): BandLine[] {
  const lines = new Map<string, BandLine>();
  const bands = [...antenna.bands].sort((left, right) => left.frequencyMhz - right.frequencyMhz);
  for (const band of bands) {
    const key = getBandLineKey(band);
    const line = lines.get(key);
    if (line) line.bands.push(band);
    else lines.set(key, { key, bands: [band], measuredTilt: band.measuredTilt, tiltRange: band.tiltRange });
  }

  return [...lines.values()];
}

export function listBandClusters(bands: readonly EmfAntennaBand[]): BandCluster[] {
  const frequenciesByRat = new Map<BandRat, number[]>();
  for (const band of bands) {
    const frequencies = frequenciesByRat.get(band.rat);
    if (frequencies === undefined) frequenciesByRat.set(band.rat, [band.frequencyMhz]);
    else if (!frequencies.includes(band.frequencyMhz)) frequencies.push(band.frequencyMhz);
  }

  return [...frequenciesByRat.entries()].map(([rat, frequencies]) => ({ rat, frequencies }));
}

export function listOwnBandEirps(bands: readonly EmfAntennaBand[], totalEirpWatts: number | null): BandEirp[] {
  const eirps: BandEirp[] = [];
  for (const { frequencyMhz, eirpWatts } of bands) {
    if (eirpWatts === null || eirpWatts === totalEirpWatts) continue;
    if (eirps.some((listed) => listed.frequencyMhz === frequencyMhz && listed.eirpWatts === eirpWatts)) continue;
    eirps.push({ frequencyMhz, eirpWatts });
  }

  return eirps;
}

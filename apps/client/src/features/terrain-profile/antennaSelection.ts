import { calculateBearing } from "@openbts/shared/radiolinesUtils";
import { ANTENNA_AZIMUTH_TOLERANCE_DEG, circularAzimuthDeltaDeg } from "@openbts/shared/terrainProfile";

import type { GeoPoint, ReadyTerrainProfile, TerrainAntenna } from "./types";

export type LabeledAntenna = {
  antenna: TerrainAntenna;
  label: string;
};

type AntennaChoices = {
  offered: LabeledAntenna[];
  folded: LabeledAntenna[];
};

type AntennaDescriber = (antenna: TerrainAntenna, withHeight: boolean) => string;

const OMNIDIRECTIONAL_AZIMUTH = 360;

export function isOmnidirectional(antenna: Pick<TerrainAntenna, "azimuth">): boolean {
  return antenna.azimuth === OMNIDIRECTIONAL_AZIMUTH;
}

export function getDirectionalAzimuth(antenna: Pick<TerrainAntenna, "azimuth">): number | null {
  return antenna.azimuth === null || isOmnidirectional(antenna) ? null : antenna.azimuth;
}

export function findSelectedAntenna(profile: ReadyTerrainProfile, selectedAntennaKey: string | null): TerrainAntenna {
  return profile.candidates.find((candidate) => candidate.key === selectedAntennaKey) ?? profile.antenna;
}

function isPointingTowards(antenna: TerrainAntenna, bearing: number): boolean {
  const azimuth = getDirectionalAzimuth(antenna);
  if (azimuth === null) return true;
  if (!Number.isFinite(azimuth) || !Number.isFinite(bearing)) return false;
  return circularAzimuthDeltaDeg(azimuth, bearing) <= ANTENNA_AZIMUTH_TOLERANCE_DEG;
}

function listUniqueAntennas(antennas: readonly TerrainAntenna[]): TerrainAntenna[] {
  const byKey = new Map<string, TerrainAntenna>();
  for (const antenna of antennas) if (!byKey.has(antenna.key)) byKey.set(antenna.key, antenna);
  return [...byKey.values()];
}

function labelAntennas(antennas: readonly TerrainAntenna[], selectedKey: string | null, describeAntenna: AntennaDescriber): LabeledAntenna[] {
  const shortLabels = antennas.map((antenna) => describeAntenna(antenna, false));
  const labels = antennas.map((antenna, index) => {
    const isAmbiguous = shortLabels.indexOf(shortLabels[index]) !== shortLabels.lastIndexOf(shortLabels[index]);
    return isAmbiguous ? describeAntenna(antenna, true) : shortLabels[index];
  });

  const indexByLabel = new Map<string, number>();
  for (const [index, label] of labels.entries()) {
    if (!indexByLabel.has(label) || antennas[index].key === selectedKey) indexByLabel.set(label, index);
  }

  const keptIndexes = [...indexByLabel.values()].sort((left, right) => left - right);
  return keptIndexes.map((index) => ({ antenna: antennas[index], label: labels[index] }));
}

export function getReceiverBearing(station: GeoPoint, receiver: GeoPoint): number {
  return calculateBearing(station.latitude, station.longitude, receiver.latitude, receiver.longitude);
}

export function listAntennaChoices(
  candidates: readonly TerrainAntenna[],
  selected: TerrainAntenna,
  bearing: number,
  describeAntenna: AntennaDescriber,
): AntennaChoices {
  const antennas = listUniqueAntennas([...candidates, selected]);
  const labeled = labelAntennas(antennas, selected.key, describeAntenna);
  const pointing = labeled.filter(({ antenna }) => isPointingTowards(antenna, bearing));
  if (pointing.length === 0) return { offered: labeled, folded: [] };

  const isOffered = ({ antenna }: LabeledAntenna) => antenna.key === selected.key || pointing.some((entry) => entry.antenna.key === antenna.key);
  return { offered: labeled.filter(isOffered), folded: labeled.filter((entry) => !isOffered(entry)) };
}

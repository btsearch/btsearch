import type { EmfAntenna, EmfAntennaBand } from "../types";
import { listBandFrequencies } from "./antennaModel";

export type AntennaComparison = {
  previousAntennas: (EmfAntenna | null)[];
  removedAntennas: EmfAntenna[];
  addedCount: number;
  changedCount: number;
};

function getMatchKey(antenna: EmfAntenna): string {
  return [antenna.azimuth, antenna.heightMeters, listBandFrequencies(antenna.bands).join(",")].join("|");
}

function findPreviousBands(band: EmfAntennaBand, previous: EmfAntenna): EmfAntennaBand[] {
  const sameFrequency = previous.bands.filter((candidate) => candidate.frequencyMhz === band.frequencyMhz);
  const sameTechnology = sameFrequency.filter((candidate) => candidate.rat === band.rat);
  return sameTechnology.length > 0 ? sameTechnology : sameFrequency;
}

export function getPreviousTotalEirp(antenna: EmfAntenna, previous: EmfAntenna): number | null {
  if (previous.totalEirpWatts === null || previous.totalEirpWatts === antenna.totalEirpWatts) return null;
  return previous.totalEirpWatts;
}

export function listPreviousTilts(bands: readonly EmfAntennaBand[], previous: EmfAntenna): (number | null)[] {
  const previousTilts = new Set<number | null>();
  for (const band of bands) {
    for (const previousBand of findPreviousBands(band, previous)) {
      if (previousBand.measuredTilt !== band.measuredTilt) previousTilts.add(previousBand.measuredTilt);
    }
  }

  return [...previousTilts];
}

function hasAntennaChanged(antenna: EmfAntenna, previous: EmfAntenna): boolean {
  return getPreviousTotalEirp(antenna, previous) !== null || listPreviousTilts(antenna.bands, previous).length > 0;
}

export function compareAntennaReports(antennas: readonly EmfAntenna[], olderAntennas: readonly EmfAntenna[]): AntennaComparison {
  const unmatchedAntennas = [...olderAntennas];
  const previousAntennas: (EmfAntenna | null)[] = [];
  for (const antenna of antennas) {
    const matchKey = getMatchKey(antenna);
    const matchIndex = unmatchedAntennas.findIndex((candidate) => getMatchKey(candidate) === matchKey);
    previousAntennas.push(matchIndex === -1 ? null : unmatchedAntennas.splice(matchIndex, 1)[0]);
  }

  return {
    previousAntennas,
    removedAntennas: unmatchedAntennas,
    addedCount: previousAntennas.filter((previous) => previous === null).length,
    changedCount: antennas.filter((antenna, position) => {
      const previous = previousAntennas[position];
      return previous !== null && hasAntennaChanged(antenna, previous);
    }).length,
  };
}

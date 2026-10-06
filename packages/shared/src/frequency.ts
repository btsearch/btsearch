import { type CatalogBand, bandsForChannel, channelKhz, isChannelValidForBand, nrChannelKhz, resolveCatalogBand } from "./bandCatalog.ts";

export type FrequencyInfo = { frequency: string | null; bandName: string | null };

function displayName(band: CatalogBand): string | null {
  if (band.rat === "UMTS") return `Band ${band.code}`;
  if (band.rat === "LTE") return `b${band.number}`;
  if (band.rat === "NR") return band.code;
  return null;
}

function formatMhz(frequencyKhz: number): string {
  const freq = frequencyKhz / 1000;
  const formatted = freq % 1 === 0 ? `${freq}.0` : freq.toFixed(2).replace(/0+$/, "");
  return `${formatted} MHz`;
}

export function getBandName(rat: string, bandValue: number, duplex?: string | null): string | null {
  if (bandValue === 0) return null;
  const band = resolveCatalogBand({ rat, value: bandValue, duplex });
  return band ? displayName(band) : null;
}

export function calcExactFrequency(rat: string, bandValue: number, arfcn: number | null | undefined, duplex?: string | null): FrequencyInfo | null {
  if (arfcn === null || arfcn === undefined || bandValue === 0) return null;
  if (rat !== "UMTS" && rat !== "LTE" && rat !== "NR") return null;

  const labelled = resolveCatalogBand({ rat, value: bandValue, duplex });
  if (rat === "NR") {
    const frequencyKhz = nrChannelKhz(arfcn);
    if (frequencyKhz === null) return null;
    return { frequency: formatMhz(frequencyKhz), bandName: labelled ? displayName(labelled) : null };
  }

  const candidates = bandsForChannel(rat, arfcn);
  const band = candidates.find((candidate) => candidate.code === labelled?.code) ?? candidates[0];
  if (!band) return null;

  const frequencyKhz = channelKhz(band, arfcn);
  if (frequencyKhz === null) return null;
  return { frequency: formatMhz(frequencyKhz), bandName: displayName(band) };
}

/**
 * Validates that the given ARFCN falls within the expected range for the specified band
 * @param rat - "UMTS", "LTE", "NR"
 * @param bandFreqValue - Band frequency value
 * @param arfcn - The ARFCN/EARFCN/NR-ARFCN to validate
 * @param duplex - "FDD" or "TDD" (required to distinguish e.g. B7 vs B38 at 2600 MHz)
 */
export function isARFCNValidForBand(rat: string, bandFreqValue: number, arfcn: number, duplex?: string | null): boolean {
  return isChannelValidForBand({ rat, value: bandFreqValue, duplex }, arfcn);
}

import type { Band, BandRat, StationBreakdownRow } from "../types";
import { formatBandMhzLabel } from "@/features/station-details/station/utils/bands";

export type BandGroupKey = "gsm" | "umts" | "lte" | "nr" | "other";
export type BandGroup = { key: BandGroupKey; label: string; rats: readonly BandRat[]; generationRat: string | null };
export type BreakdownTotals = { stations: number; cells: number };

type BreakdownKey = "regionId" | "operatorId" | "bandId";

const KHZ_PER_MHZ = 1000;

const RAT_LABELS: Record<BandRat, string> = { gsm: "GSM", cdma: "CDMA", umts: "UMTS", lte: "LTE", nr: "NR", iot: "IoT" };

export const RAILWAY_GSM_LABEL = "GSM-R";

export const BAND_GROUPS: readonly BandGroup[] = [
  { key: "gsm", label: "GSM", rats: ["gsm"], generationRat: "GSM" },
  { key: "umts", label: "UMTS", rats: ["umts"], generationRat: "UMTS" },
  { key: "lte", label: "LTE", rats: ["lte"], generationRat: "LTE" },
  { key: "nr", label: "NR", rats: ["nr"], generationRat: "NR" },
  { key: "other", label: "CDMA, IoT", rats: ["cdma", "iot"], generationRat: null },
];

export function getRatLabel(rat: BandRat): string {
  return RAT_LABELS[rat];
}

export function getGenerationRat(rat: BandRat): string {
  return rat.toUpperCase();
}

export function getBandGroupKey(rat: BandRat): BandGroupKey {
  return BAND_GROUPS.find((group) => group.rats.includes(rat))?.key ?? "other";
}

export function groupBands<T extends { rat: BandRat }>(bands: readonly T[]): { group: BandGroup; bands: T[] }[] {
  const groups = BAND_GROUPS.map((group) => ({ group, bands: bands.filter((band) => group.rats.includes(band.rat)) }));
  return groups.filter((entry) => entry.bands.length > 0);
}

export function getBandShortLabel(band: Band, language: string): string {
  if (band.rat === "cdma" || band.rat === "iot" || band.labelMhz === null) return band.name;

  const label = formatBandMhzLabel(band.labelMhz, language);
  if (band.rat === "gsm") return band.variant === "railway" ? `${label} ${RAILWAY_GSM_LABEL}` : label;
  return band.duplex === null ? label : `${label} ${band.duplex.toUpperCase()}`;
}

export function formatBandRange(range: readonly [number, number] | null): string | null {
  if (range === null) return null;
  const [low, high] = range;
  return `${low / KHZ_PER_MHZ}-${high / KHZ_PER_MHZ}`;
}

export function indexBreakdown(rows: readonly StationBreakdownRow[], key: BreakdownKey, countryCode?: string): Map<number, BreakdownTotals> {
  const totalsById = new Map<number, BreakdownTotals>();
  for (const row of rows) {
    const id = row[key];
    if (id === null || (countryCode !== undefined && row.countryCode !== countryCode)) continue;

    const totals = totalsById.get(id);
    totalsById.set(id, { stations: (totals?.stations ?? 0) + row.stations, cells: (totals?.cells ?? 0) + row.cells });
  }
  return totalsById;
}

export function sumCellsByBand(rows: readonly StationBreakdownRow[], countryCode?: string): Map<number, number> {
  const cellsByBand = new Map<number, number>();
  for (const [bandId, totals] of indexBreakdown(rows, "bandId", countryCode)) cellsByBand.set(bandId, totals.cells);
  return cellsByBand;
}

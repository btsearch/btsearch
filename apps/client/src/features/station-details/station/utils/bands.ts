import type { Band, Cell, CellRat } from "../types";
import type { RatType } from "@/features/shared/rat";

export type DuplexMark = "FDD" | "TDD" | "SDL";

const RAT_TYPES: Record<CellRat, RatType> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };
export const DUPLEX_MARKS: Record<NonNullable<Band["duplex"]>, DuplexMark> = { fdd: "FDD", tdd: "TDD", sdl: "SDL" };
export const UNLABELLED_BAND_MHZ = 0;
const LOWEST_GHZ_LABEL_MHZ = 6000;
const MHZ_PER_GHZ = 1000;
const GHZ_LABEL_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
const TECHNOLOGY_BAND_PATTERN = /^(.+?)(\d+)$/;

export function toRatType(rat: CellRat): RatType {
  return RAT_TYPES[rat];
}

export function isBandLabelInGhz(labelMhz: number): boolean {
  return labelMhz >= LOWEST_GHZ_LABEL_MHZ;
}

export function formatBandMhzLabel(labelMhz: number, language: string): string {
  if (!isBandLabelInGhz(labelMhz)) return String(labelMhz);
  return `${(labelMhz / MHZ_PER_GHZ).toLocaleString(language, GHZ_LABEL_FORMAT)} GHz`;
}

export function groupTechnologyBands(bands: readonly string[], language: string): Map<string, string[]> {
  const technologies = new Map<string, string[]>();

  for (const band of bands) {
    const match = band.match(TECHNOLOGY_BAND_PATTERN);
    const technology = match?.[1] ?? band;
    const value = match?.[2];
    const values = technologies.get(technology) ?? [];
    if (value !== undefined) values.push(formatBandMhzLabel(Number(value), language));
    technologies.set(technology, values);
  }

  return technologies;
}

export function getBandLabel(band: Band | undefined, language: string): string | null {
  if (band === undefined) return null;
  return band.labelMhz === null ? band.name : formatBandMhzLabel(band.labelMhz, language);
}

export function getBandCode(band: Band | undefined): string | null {
  if (band === undefined || band.number === null) return null;
  if (band.rat === "lte") return `b${band.number}`;
  if (band.rat === "nr") return `n${band.number}`;
  return null;
}

export function getBandDuplexMark(band: Band | undefined): DuplexMark | null {
  if (band === undefined || band.rat === "gsm" || band.duplex === null) return null;
  return DUPLEX_MARKS[band.duplex];
}

export function getBandSortValue(band: Band | undefined): number {
  return band?.labelMhz ?? UNLABELLED_BAND_MHZ;
}

export function getCellChannel(cell: Cell): number | null {
  if (cell.rat === "umts") return cell.uarfcn;
  if (cell.rat === "lte") return cell.earfcn;
  if (cell.rat === "nr") return cell.arfcn;
  return null;
}

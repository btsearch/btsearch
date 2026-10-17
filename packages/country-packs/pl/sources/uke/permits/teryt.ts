import type { SheetValue } from "../shared/sheets.ts";

const REGION_TERYT_PREFIXES = new Set(["02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22", "24", "26", "28", "30", "32"]);

export function regionIsoCodeFromTeryt(teryt: SheetValue): string | null {
  const prefix = String(teryt || "").slice(0, 2);
  return REGION_TERYT_PREFIXES.has(prefix) ? `PL-${prefix}` : null;
}

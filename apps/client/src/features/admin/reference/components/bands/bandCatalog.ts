import type { BandLike, CatalogBand, CatalogRat, KhzRange } from "@openbts/shared/bandCatalog";
import { queryOptions } from "@tanstack/react-query";
import type { TFunction } from "i18next";

import { referenceKeys } from "../../api/queryKeys";
import type { Band, BandRat } from "../../types";
import { RAILWAY_GSM_LABEL, formatBandRange } from "../../utils/bands";

export type { CatalogBand } from "@openbts/shared/bandCatalog";

export type BandVariant = Band["variant"];

type BandCatalog = {
  entries: readonly CatalogBand[];
  resolveBand: (band: BandLike) => CatalogBand | null;
};

const CATALOG_RATS: Partial<Record<BandRat, CatalogRat>> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };
const WORD_BREAK = /\s+/;

async function loadBandCatalog(): Promise<BandCatalog> {
  const { BAND_CATALOG, resolveCatalogBand } = await import("@openbts/shared/bandCatalog");
  return { entries: BAND_CATALOG, resolveBand: resolveCatalogBand };
}

export function bandCatalogQueryOptions() {
  return queryOptions({
    queryKey: [...referenceKeys.all, "band-catalog"] as const,
    queryFn: loadBandCatalog,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function getCatalogRat(rat: BandRat): CatalogRat | null {
  return CATALOG_RATS[rat] ?? null;
}

export function isUplinkOnly(entry: CatalogBand): boolean {
  return entry.duplex === "SUL";
}

export function listCatalogEntries(catalog: BandCatalog, editedBand: Band | null): readonly CatalogBand[] {
  if (editedBand === null) return catalog.entries;

  const rat = getCatalogRat(editedBand.rat);
  return catalog.entries.filter((entry) => entry.rat === rat);
}

export function describeBandRanges(downlinkKhz: KhzRange | null, uplinkKhz: KhzRange | null): string[] {
  const downlink = formatBandRange(downlinkKhz);
  const uplink = formatBandRange(uplinkKhz);
  if (downlink !== null && downlink === uplink) return [downlink];

  const ranges: string[] = [];
  if (downlink !== null) ranges.push(`DL ${downlink}`);
  if (uplink !== null) ranges.push(`UL ${uplink}`);
  return ranges;
}

export function formatCatalogRanges(entry: CatalogBand): string {
  return `${describeBandRanges(entry.downlinkKhz, entry.uplinkKhz).join(", ")} MHz`;
}

export function getCatalogBandLabel(t: TFunction, entry: CatalogBand): string {
  const band = `${entry.rat} ${entry.labelMhz}`;
  if (entry.duplex === "SDL") return t("admin:reference.bands.picker.downlinkOnly", { band });
  if (entry.duplex === "SUL") return t("admin:reference.bands.picker.uplinkOnly", { band });
  return `${band} ${entry.duplex}`;
}

export function getCatalogBandName(entry: CatalogBand, variant: BandVariant): string {
  if (entry.rat !== "GSM") return `${entry.rat} ${entry.labelMhz} (${entry.duplex})`;
  return variant === "railway" ? `${RAILWAY_GSM_LABEL} ${entry.labelMhz}` : `${entry.rat} ${entry.labelMhz}`;
}

export function matchesCatalogQuery(entry: CatalogBand, query: string): boolean {
  const text = `${entry.code} ${entry.rat} ${entry.labelMhz} ${entry.duplex}`.toLowerCase();
  const words = query.toLowerCase().split(WORD_BREAK);
  return words.every((word) => text.includes(word));
}

function resolveBandCode(band: Band, resolveBand: BandCatalog["resolveBand"]): string | null {
  if (band.code !== null) return band.code;

  const rat = getCatalogRat(band.rat);
  if (rat === null || (band.duplex === null && rat !== "GSM")) return null;

  const duplex = band.duplex === null ? null : band.duplex.toUpperCase();
  return resolveBand({ rat, value: band.labelMhz, duplex, variant: band.variant })?.code ?? null;
}

export function indexTakenCodes(
  bands: readonly Band[],
  variant: BandVariant,
  editedBandId: number | null,
  resolveBand: BandCatalog["resolveBand"],
): Map<string, string> {
  const namesByCode = new Map<string, string>();
  for (const band of bands) {
    if (band.id === editedBandId || band.variant !== variant) continue;

    const code = resolveBandCode(band, resolveBand);
    if (code !== null && !namesByCode.has(code)) namesByCode.set(code, band.name);
  }
  return namesByCode;
}

import { findPreferredRatBand } from "@/features/shared/rat";
import { getBandFromEARFCN, getBandFromUARFCN, getBandMhz } from "@/lib/cellular/bands";
import type { AnalyzerResult } from "@/routes/_layout/analyzer";
import type { Band } from "@/types/station";

import type { GSMCellDetails, LTECellDetails, NRCellDetails, UMTSCellDetails } from "../types";
import type { StoredParsedRow } from "./analyzerDraftStore";

export type AnalyzerRat = "GSM" | "UMTS" | "LTE" | "NR";
export type AnalyzerMatchedCell = NonNullable<AnalyzerResult["cell"]>;
export type MismatchDetails = Partial<GSMCellDetails & UMTSCellDetails & LTECellDetails & NRCellDetails>;

export type AnalyzerDetailKey = Extract<keyof MismatchDetails, string>;
type DetailFieldMapping = { detailKey: AnalyzerDetailKey; sourceKey: string };
type WarningFieldMapping = DetailFieldMapping & { warningKeys: readonly string[] };
type AnalyzerRatSpec = {
  baseDetails: readonly DetailFieldMapping[];
  warningDetails: readonly WarningFieldMapping[];
  probableAddDetails?: readonly DetailFieldMapping[];
  channelBandResolver?: (channel: number) => number | null;
};

export type AnalyzerBandChoice = { duplex: string | null; band_id: number };

const ANALYZER_RAT_SPECS: Record<AnalyzerRat, AnalyzerRatSpec> = {
  GSM: {
    baseDetails: [
      { detailKey: "lac", sourceKey: "lac" },
      { detailKey: "cid", sourceKey: "cid" },
    ],
    warningDetails: [{ warningKeys: ["lac_mismatch"], detailKey: "lac", sourceKey: "lac" }],
  },
  UMTS: {
    baseDetails: [
      { detailKey: "rnc", sourceKey: "rnc" },
      { detailKey: "cid", sourceKey: "cid" },
      { detailKey: "lac", sourceKey: "lac" },
      { detailKey: "arfcn", sourceKey: "arfcn" },
    ],
    warningDetails: [
      { warningKeys: ["lac_mismatch"], detailKey: "lac", sourceKey: "lac" },
      { warningKeys: ["uarfcn_mismatch"], detailKey: "arfcn", sourceKey: "uarfcn" },
      { warningKeys: ["rnc_mismatch"], detailKey: "rnc", sourceKey: "rnc" },
    ],
    channelBandResolver: getBandFromUARFCN,
  },
  LTE: {
    baseDetails: [
      { detailKey: "enbid", sourceKey: "enbid" },
      { detailKey: "clid", sourceKey: "clid" },
      { detailKey: "tac", sourceKey: "tac" },
      { detailKey: "pci", sourceKey: "pci" },
      { detailKey: "earfcn", sourceKey: "earfcn" },
    ],
    warningDetails: [
      { warningKeys: ["tac_mismatch"], detailKey: "tac", sourceKey: "tac" },
      { warningKeys: ["pci_mismatch", "pci_missing"], detailKey: "pci", sourceKey: "pci" },
      { warningKeys: ["earfcn_mismatch"], detailKey: "earfcn", sourceKey: "earfcn" },
    ],
    probableAddDetails: [
      { detailKey: "enbid", sourceKey: "enbid" },
      { detailKey: "clid", sourceKey: "clid" },
      { detailKey: "tac", sourceKey: "tac" },
      { detailKey: "pci", sourceKey: "pci" },
      { detailKey: "earfcn", sourceKey: "earfcn" },
    ],
    channelBandResolver: getBandFromEARFCN,
  },
  NR: {
    baseDetails: [],
    warningDetails: [],
  },
};

function readValue(source: object, key: string): number | boolean | string | null | undefined {
  return (source as unknown as Record<string, number | boolean | string | null | undefined>)[key];
}

function assignDetail(details: MismatchDetails, key: AnalyzerDetailKey, value: number | boolean | string | null | undefined) {
  if (value === null || value === undefined) return;
  Object.assign(details, { [key]: value });
}

export function buildAnalyzerBaseDetails(rat: AnalyzerRat, cell: AnalyzerMatchedCell): MismatchDetails {
  const details: MismatchDetails = {};
  for (const field of ANALYZER_RAT_SPECS[rat].baseDetails) assignDetail(details, field.detailKey, readValue(cell, field.sourceKey));
  return details;
}

export function buildAnalyzerWarningDetails(rat: AnalyzerRat, row: StoredParsedRow, warnings: readonly string[]): MismatchDetails {
  const details: MismatchDetails = {};
  for (const field of ANALYZER_RAT_SPECS[rat].warningDetails) {
    if (!field.warningKeys.some((warning) => warnings.includes(warning))) continue;
    assignDetail(details, field.detailKey, readValue(row, field.sourceKey));
  }
  return details;
}

export function buildAnalyzerProbableAddDetails(rat: AnalyzerRat, row: StoredParsedRow): MismatchDetails {
  const details: MismatchDetails = {};
  for (const field of ANALYZER_RAT_SPECS[rat].probableAddDetails ?? []) assignDetail(details, field.detailKey, readValue(row, field.sourceKey));
  return details;
}

export function getAnalyzerBandNumber(rat: AnalyzerRat, channel: number): number | null {
  return ANALYZER_RAT_SPECS[rat].channelBandResolver?.(channel) ?? null;
}

export function getAnalyzerBandMhz(rat: AnalyzerRat, channel: number): string | null {
  const band = getAnalyzerBandNumber(rat, channel);
  return band !== null ? getBandMhz(band) : null;
}

export function resolveAnalyzerBandChoices(
  rat: AnalyzerRat,
  details: MismatchDetails,
  bands: Band[],
): { band_id: number | null; duplexChoices: AnalyzerBandChoice[] } {
  const channel = readValue(details, "earfcn") ?? readValue(details, "arfcn");
  if (typeof channel !== "number") return { band_id: null, duplexChoices: [] };

  const bandNumber = getAnalyzerBandNumber(rat, channel);
  if (bandNumber === null) return { band_id: null, duplexChoices: [] };

  const mhz = Number(getBandMhz(bandNumber));
  const matching = bands.filter((band) => band.rat === rat && band.value === mhz);
  if (matching.length === 1) return { band_id: matching[0].id, duplexChoices: [] };
  if (matching.length > 1) {
    const defaultBand = findPreferredRatBand(matching, rat, mhz);
    if (defaultBand) return { band_id: defaultBand.id, duplexChoices: [] };
    return { band_id: null, duplexChoices: matching.map((band) => ({ duplex: band.duplex, band_id: band.id })) };
  }
  return { band_id: null, duplexChoices: [] };
}

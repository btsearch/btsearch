import {
  type CLFDescriptionTemplatePlaceholder,
  type CLFDescriptionTemplateValues,
  type CLFDescriptionTemplates,
  CLF_DESCRIPTION_TEMPLATE_DEFAULTS,
  type ClfExportFormat,
  renderCLFDescriptionTemplate,
} from "@openbts/shared/clfExportTemplates";
import { getBandName } from "@openbts/shared/frequency";

export type ClfFormat = ClfExportFormat;
export type DescriptionTemplates = CLFDescriptionTemplates;

export interface ConvertOptions {
  templates?: DescriptionTemplates;
  displayNRSeparately?: boolean;
}

const NTM_UNKNOWN = 2147483647; // 2^31-1, used in netmonitor format

export interface CellExportData {
  cid: number;
  lac?: number | null;
  tac?: number | null;
  nrtac?: number | null;
  rnc?: number | null;
  cid_long?: number | null;
  enbid?: number | null;
  clid?: number | null;
  ecid?: number | null;
  gnbid?: number | null;
  pci?: number | null;
  nci?: bigint | null;
  rat: "GSM" | "CDMA" | "UMTS" | "LTE" | "NR";
  nr_type?: "nsa" | "sa" | null;
  band_value?: number | null;
  band_name: string;
  band_duplex?: "FDD" | "TDD" | null;
  station_lte_tac?: number | null;
  station_id: string;
  operator_mnc?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  city?: string | null;
  address?: string | null;
  e_gsm?: boolean | null;
  arfcn?: number | null; // UMTS UARFCN
  region_code?: string | null;
  is_confirmed?: boolean | null;
  sector_index?: number;
  sector_azimuth?: number;
  nr_bands?: Array<{ value: number; duplex: "FDD" | "TDD" | null }>; // associated NR bands at same station (for LTE cells)
  nr_band_pcis?: NRBandPCIs[];
}

export interface NRBandPCIs {
  value: number;
  duplex: "FDD" | "TDD" | null;
  pcis: Array<{ value: number; is_confirmed: boolean | null }>;
  has_missing_pci: boolean;
}

const EARFCN_MAP: Record<number, Partial<Record<number, { fdd?: number; tdd?: number }>>> = {
  26001: {
    800: { fdd: -1 },
    900: { fdd: 3526 },
    1800: { fdd: 1355 },
    2100: { fdd: 350 },
    2600: { fdd: 2850, tdd: 37900 },
  },
  26002: {
    800: { fdd: 6375 },
    900: { fdd: 3686 },
    1800: { fdd: 1575 },
    2100: { fdd: 225 },
    2600: { fdd: 3175, tdd: NTM_UNKNOWN },
  },
  26003: {
    700: { fdd: 9310 },
    800: { fdd: 6200 },
    900: { fdd: 3764 },
    1800: { fdd: 1725 },
    2100: { fdd: 75 },
    2600: { fdd: 3025, tdd: NTM_UNKNOWN },
  },
  26006: {
    700: { fdd: 9460 },
    800: { fdd: 6275 },
    900: { fdd: 3476 },
    1800: { fdd: 1875 },
    2100: { fdd: 525 },
    2600: { fdd: 3350, tdd: NTM_UNKNOWN },
  },
};

function getEARFCN(mnc: number | null | undefined, bandValue: number | null | undefined, duplex: "FDD" | "TDD" | null | undefined): number {
  if (!mnc || !bandValue) return NTM_UNKNOWN;
  const entry = EARFCN_MAP[mnc]?.[bandValue];
  if (!entry) return NTM_UNKNOWN;
  return (duplex === "TDD" ? entry.tdd : entry.fdd) ?? NTM_UNKNOWN;
}

function getNRDesignation(bandValue: number | null | undefined, duplex: "FDD" | "TDD" | null | undefined): string | null {
  switch (bandValue) {
    case 700:
      return "n28";
    case 800:
      return "n20";
    case 900:
      return "n8";
    case 1800:
      return "n3";
    case 2100:
      return "n1";
    case 2600:
      return duplex === "TDD" ? "n41" : "n7";
    case 3500:
      return "n78";
    default:
      return null;
  }
}

function getLteBandName(bandValue: number | null | undefined, duplex: "FDD" | "TDD" | null | undefined): string {
  if (bandValue === null || bandValue === undefined) return "";
  return getBandName("LTE", bandValue, duplex) ?? "";
}

function getLocationDescription(cell: CellExportData): string {
  const parts: string[] = [];
  const locationParts = [cell.city, cell.address].filter(Boolean).join(", ");
  if (locationParts) parts.push(locationParts);
  return (parts.join(" - ") || cell.station_id).replace(/;/g, ",");
}

function getBaseDescription(cell: CellExportData): string {
  const sectorPrefix = getSectorPrefix(cell);
  return `${sectorPrefix ? `${sectorPrefix} ` : ""}${getLocationDescription(cell)}`;
}

function getUnconfirmedPrefix(cell: CellExportData): string {
  return cell.is_confirmed === false ? "[!]" : "";
}

function getSectorNumber(cell: CellExportData): string {
  return cell.sector_index !== undefined ? String(cell.sector_index) : "";
}

function getSectorLabel(cell: CellExportData): string {
  const sectorNumber = getSectorNumber(cell);
  return sectorNumber ? `S${sectorNumber}` : "";
}

function getSectorAzimuth(cell: CellExportData): string {
  return cell.sector_azimuth !== undefined ? `${cell.sector_azimuth}°` : "";
}

function getSectorTag(cell: CellExportData): string {
  const sectorLabel = getSectorLabel(cell);
  const sectorAzimuth = getSectorAzimuth(cell);
  return sectorLabel && sectorAzimuth ? `${sectorLabel}: ${sectorAzimuth}` : "";
}

function getSectorPrefix(cell: CellExportData): string {
  const sectorTag = getSectorTag(cell);
  return sectorTag ? `[${sectorTag}]` : "";
}

function getBandCode(rat: "GSM" | "UMTS", bandValue: number | null | undefined, e_gsm?: boolean | null): string | null {
  if (!bandValue) return null;
  switch (rat) {
    case "GSM":
      return `${e_gsm ? "E" : "G"}${bandValue}`;
    case "UMTS":
      return `U${bandValue}`;
  }
}

function formatIdField(value: bigint | number, radix: 10 | 16): string {
  return radix === 16 ? value.toString(16).toUpperCase().padStart(4, "0") : value.toString().padStart(5, "0");
}

function getPosRat(cell: CellExportData): number {
  return cell.latitude !== null && cell.latitude !== undefined && cell.longitude !== null && cell.longitude !== undefined ? -1 : 0;
}

function getMccMnc(cell: CellExportData): { mcc: string; mnc: string } {
  return { mcc: "260", mnc: cell.operator_mnc?.toString().slice(-2).padStart(2, "0") ?? "00" };
}

function toCLF2x(cell: CellExportData, radix: 10 | 16, options?: ConvertOptions): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac;
  const cellId = getCellIdForExport(cell);
  if (!cellId || !lac) return null;

  const mccmnc = cell.operator_mnc;
  const description = renderDescription(cell, options);

  return `${formatIdField(cellId, radix)}${formatIdField(lac, radix)}${mccmnc}\t${description}`;
}

export function toCLF20(cell: CellExportData, options?: ConvertOptions): string | null {
  return toCLF2x(cell, 16, options);
}

export function toCLF21(cell: CellExportData, options?: ConvertOptions): string | null {
  return toCLF2x(cell, 10, options);
}

function toCLF30(cell: CellExportData, radix: 10 | 16, options?: ConvertOptions): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac ?? 0;
  const cellId = getCellIdForExport(cell);
  if (!cellId) return null;

  const hexPrefix = radix === 16 ? "0x" : "";
  const mccmnc = cell.operator_mnc;
  const cidFormatted = `${hexPrefix}${formatIdField(cellId, radix)}`;
  const lacFormatted = `${hexPrefix}${formatIdField(lac, radix)}`;
  const rncFormatted = `${hexPrefix}${formatIdField(cell.rnc ?? 0, radix)}`;
  const lat = cell.latitude ?? 0;
  const lon = cell.longitude ?? 0;
  const posRat = getPosRat(cell);
  const description = renderDescription(cell, options);

  return `${mccmnc};${cidFormatted};${lacFormatted};${rncFormatted};${lat};${lon};${posRat};${description};0`;
}

export function toCLF30Hex(cell: CellExportData, options?: ConvertOptions): string | null {
  return toCLF30(cell, 16, options);
}

export function toCLF30Dec(cell: CellExportData, options?: ConvertOptions): string | null {
  return toCLF30(cell, 10, options);
}

export function toCLF40(cell: CellExportData, options?: ConvertOptions): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac ?? 0;
  const cellId = getCellIdForExport(cell);
  if (!cellId) return null;

  const mccmnc = cell.operator_mnc;
  const cidFormatted = formatIdField(cellId, 10);
  const lacFormatted = formatIdField(lac, 10);
  const type = 0;
  const lat = cell.latitude ?? 0;
  const lon = cell.longitude ?? 0;
  const posRat = getPosRat(cell);
  const description = renderDescription(cell, options);
  const sys = getRatCode(cell.rat);
  const label = `${cell.station_id}_${cellId}`;
  const azi = 0;
  const height = 0;
  const hbw = 0;
  const vbw = 0;
  const tilt = 0;
  const loc = cell.station_id;

  return `${mccmnc};${cidFormatted};${lacFormatted};${type};${lat};${lon};${posRat};${description};${sys};${label};${azi};${height};${hbw};${vbw};${tilt};${loc}`;
}

function getCellIdForExport(cell: CellExportData): bigint | number | null {
  switch (cell.rat) {
    case "GSM":
      return cell.cid;
    case "CDMA":
      return cell.clid ?? cell.cid;
    case "UMTS":
      return cell.cid ?? cell.cid_long;
    case "LTE":
      return cell.ecid ?? cell.cid;
    case "NR":
      return cell.nci ?? cell.cid;
    default:
      return null;
  }
}
function getRatCode(rat: CellExportData["rat"]): number {
  switch (rat) {
    case "GSM":
      return 1;
    case "CDMA":
      return 2;
    case "UMTS":
      return 3;
    case "LTE":
      return 4;
    case "NR":
      return 5;
  }
}

function getDescription(cell: CellExportData): string {
  const prefix = getUnconfirmedPrefix(cell);
  return `${prefix ? `${prefix} ` : ""}${getBaseDescription(cell)}`;
}

function isNRNsa(cell: CellExportData): boolean {
  return cell.rat === "NR" && cell.nr_type === "nsa";
}

function uniqueNRPcis(pcis: Array<{ value: number; is_confirmed: boolean | null }>): Array<{ value: number; is_confirmed: boolean | null }> {
  const byValue = new Map<number, { value: number; is_confirmed: boolean | null }>();
  for (const pci of pcis) {
    const existing = byValue.get(pci.value);
    if (!existing) byValue.set(pci.value, pci);
    else if (pci.is_confirmed === false) existing.is_confirmed = false;
  }
  return [...byValue.values()];
}

type NRBandPciTemplateEntry = {
  band: string;
  bandValue: number;
  pci: string;
  bandPci: string;
  has_missing_pci: boolean;
};

function getNRBandPciTemplateEntries(nr_band_pcis: NRBandPCIs[]): NRBandPciTemplateEntry[] {
  const entries = nr_band_pcis
    .map((b) => ({
      desig: getNRDesignation(b.value, b.duplex),
      value: b.value,
      pcis: uniqueNRPcis(b.pcis).sort((a, c) => a.value - c.value),
      has_missing_pci: b.has_missing_pci,
    }))
    .filter(
      (b): b is { desig: string; value: number; pcis: Array<{ value: number; is_confirmed: boolean | null }>; has_missing_pci: boolean } =>
        b.desig !== null,
    )
    .sort((a, b) => Number.parseInt(a.desig.slice(1), 10) - Number.parseInt(b.desig.slice(1), 10));

  return entries.map((b) => {
    const bandPciBand = `${b.desig}${b.has_missing_pci ? "!" : ""}`;
    if (b.pcis.length === 0)
      return {
        band: b.desig,
        bandValue: b.value,
        pci: "",
        bandPci: bandPciBand,
        has_missing_pci: b.has_missing_pci,
      };

    const pcis = b.pcis.map((pci) => `${pci.value}${pci.is_confirmed === false ? "!" : ""}`);
    const pci = pcis.join(",");
    return {
      band: b.desig,
      bandValue: b.value,
      pci,
      bandPci: `${bandPciBand}:${pci}`,
      has_missing_pci: b.has_missing_pci,
    };
  });
}

function formatTemplateValue(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function sanitizeDescription(value: string): string {
  return value
    .replace(/;/g, ",")
    .replace(/\t/g, " ")
    .replace(/[\r\n]+/g, " ");
}

function joinNonEmpty(values: string[]): string {
  return values.filter((value) => value !== "").join(" / ");
}

function hasMissingPciForNRBand(cell: CellExportData): boolean {
  const bandEntry = cell.nr_band_pcis?.find((entry) => entry.value === cell.band_value && entry.duplex === (cell.band_duplex ?? null));
  if (bandEntry) return bandEntry.has_missing_pci;
  return cell.rat === "NR" && (cell.pci === null || cell.pci === undefined);
}

function getMarkedNRBand(cell: CellExportData): string {
  const band = getNRDesignation(cell.band_value, cell.band_duplex);
  if (band === null) return "";
  return `${band}${hasMissingPciForNRBand(cell) ? "!" : ""}`;
}

function getNRTemplateVars(cell: CellExportData): Record<string, string> {
  const fallbackBand = cell.rat === "NR" ? getMarkedNRBand(cell) : "";
  const fallbackBandValue = cell.rat === "NR" && cell.band_value ? String(cell.band_value) : "";
  const fallbackPci = cell.rat === "NR" && cell.pci !== null && cell.pci !== undefined ? String(cell.pci) : "";
  const fallbackType = cell.rat === "NR" ? (cell.nr_type?.toUpperCase() ?? "") : "";
  const empty = {
    nr_type: fallbackType,
    nr_band: fallbackBand,
    nr_band_value: fallbackBandValue,
    nr_pci: fallbackPci,
    nr_pcis: fallbackPci,
  };
  if (!cell.nr_band_pcis || cell.nr_band_pcis.length === 0) return empty;
  const entries = getNRBandPciTemplateEntries(cell.nr_band_pcis);
  return {
    nr_type: cell.rat === "LTE" ? "NSA" : (cell.nr_type?.toUpperCase() ?? ""),
    nr_band: entries.map((entry) => `${entry.band}${entry.has_missing_pci ? "!" : ""}`).join(" / "),
    nr_band_value: entries.map((entry) => String(entry.bandValue)).join(" / "),
    nr_pci: joinNonEmpty(entries.map((entry) => entry.pci)),
    nr_pcis: joinNonEmpty(entries.map((entry) => entry.pci)),
  };
}

function buildTemplateVars(cell: CellExportData): CLFDescriptionTemplateValues {
  const common = {
    location: getLocationDescription(cell),
    city: cell.city,
    address: cell.address,
    notes: cell.notes,
    sector_prefix: getSectorPrefix(cell),
    sector_tag: getSectorTag(cell),
    sector_label: getSectorLabel(cell),
    sector_number: getSectorNumber(cell),
    sector_azimuth: getSectorAzimuth(cell),
    unconfirmed_prefix: getUnconfirmedPrefix(cell),
    region: cell.region_code ?? "UNKWN",
    station_id: cell.station_id,
  };

  switch (cell.rat) {
    case "GSM":
      return {
        ...common,
        gsm_band: getBandCode("GSM", cell.band_value, cell.e_gsm),
        gsm_lac: cell.lac,
        gsm_cid: cell.cid,
      };
    case "UMTS":
      return {
        ...common,
        umts_band: getBandCode("UMTS", cell.band_value),
        umts_rnc: cell.rnc,
        umts_cid: cell.cid,
        umts_arfcn: cell.arfcn,
        umts_lac: cell.lac,
      };
    case "LTE":
      return {
        ...common,
        lte_band: getLteBandName(cell.band_value, cell.band_duplex),
        duplex: cell.band_duplex,
        lte_pci: cell.pci,
        lte_earfcn: cell.arfcn,
        lte_tac: cell.tac,
        lte_enbid: cell.enbid,
        lte_clid: cell.clid,
        lte_band_value: cell.band_value,
        ...getNRTemplateVars(cell),
      };
    case "NR": {
      const { nr_type, nr_pcis } = getNRTemplateVars(cell);
      return {
        ...common,
        nr_type,
        nr_pcis,
        nr_gnbid: cell.gnbid,
				nr_clid: cell.clid,
				nr_band_value: cell.band_value,
				duplex: cell.band_duplex,
				nr_pci: cell.pci,
        nr_arfcn: cell.arfcn,
        nr_tac: isNRNsa(cell) ? undefined : cell.nrtac,
        nr_band: getMarkedNRBand(cell),
      };
    }
    default:
      return common;
  }
}

function renderDescription(cell: CellExportData, options?: ConvertOptions): string {
  if (cell.rat === "CDMA") return sanitizeDescription(getDescription(cell));

  const templateKey = isNRNsa(cell) ? "NR_NSA" : cell.rat;
  const template = options?.templates?.[templateKey] || CLF_DESCRIPTION_TEMPLATE_DEFAULTS[templateKey];
  const vars = buildTemplateVars(cell);
  return sanitizeDescription(renderCLFDescriptionTemplate(template, (key) => formatTemplateValue(vars[key as CLFDescriptionTemplatePlaceholder])));
}

export function convertToCLF(cell: CellExportData, format: ClfFormat, options?: ConvertOptions): string | null {
  switch (format) {
    case "2.0":
      return toCLF20(cell, options);
    case "2.1":
      return toCLF21(cell, options);
    case "3.0-dec":
      return toCLF30Dec(cell, options);
    case "3.0-hex":
      return toCLF30Hex(cell, options);
    case "4.0":
      return toCLF40(cell, options);
    case "ntm":
      return toNTM(cell, options);
    case "netmonitor":
      return toNetMonitor(cell, options);
    default:
      return null;
  }
}

export function toNTM(cell: CellExportData, options?: ConvertOptions): string | null {
  const { mcc, mnc } = getMccMnc(cell);
  const lat = cell.latitude ?? 0;
  const lon = cell.longitude ?? 0;

  switch (cell.rat) {
    case "GSM": {
      const cid = cell.cid ?? NTM_UNKNOWN;
      const lac = cell.lac ?? NTM_UNKNOWN;
      const location = renderDescription(cell, options);
      return `2G;${mcc};${mnc};${cid};${lac};${NTM_UNKNOWN};${NTM_UNKNOWN};${lat};${lon};${location};${NTM_UNKNOWN}`;
    }
    case "UMTS": {
      const cid = cell.cid ?? NTM_UNKNOWN;
      const lac = cell.lac ?? NTM_UNKNOWN;
      const rnc = cell.rnc ?? NTM_UNKNOWN;
      const uarfcn = cell.arfcn ?? NTM_UNKNOWN;
      const location = renderDescription(cell, options);
      return `3G;${mcc};${mnc};${cid};${lac};${rnc};${NTM_UNKNOWN};${lat};${lon};${location};${uarfcn}`;
    }
    case "LTE": {
      const ci = cell.clid ?? NTM_UNKNOWN;
      const tac = cell.tac ?? NTM_UNKNOWN;
      const enbid = cell.enbid ?? NTM_UNKNOWN;
      const pci = cell.pci ?? NTM_UNKNOWN;
      const earfcn = cell.arfcn ?? NTM_UNKNOWN;

      const location = renderDescription(cell, options);
      return `4G;${mcc};${mnc};${ci};${tac};${enbid};${pci};${lat};${lon};${location};${earfcn}`;
    }
    case "NR": {
      const useLTETAC = options?.displayNRSeparately === true && isNRNsa(cell);
      const nci = useLTETAC ? (cell.nci ?? 1) : (cell.nci ?? NTM_UNKNOWN);
      const tac = useLTETAC ? (cell.station_lte_tac ?? NTM_UNKNOWN) : (cell.nrtac ?? NTM_UNKNOWN);
      const pci = cell.pci ?? NTM_UNKNOWN;
      const arfcn = cell.arfcn ?? NTM_UNKNOWN;

      const location = renderDescription(cell, options);
      return `5G;${mcc};${mnc};${nci};${tac};;${pci};${lat};${lon};${location};${arfcn}`;
    }
    case "CDMA": {
      const bid = cell.cid ?? NTM_UNKNOWN;
      const location = renderDescription(cell, options);
      return `CD2;${mcc};${mnc};${bid};${NTM_UNKNOWN};;${NTM_UNKNOWN};${lat};${lon};${location};`;
    }
    default:
      return null;
  }
}

export function sortCLFLines(lines: string[]): string[] {
  return lines.sort();
}

export function toNetMonitor(cell: CellExportData, options?: ConvertOptions): string | null {
  const { mcc, mnc } = getMccMnc(cell);
  const lat = cell.latitude ?? "";
  const lon = cell.longitude ?? "";
  const accuracy = 100;

  switch (cell.rat) {
    case "GSM": {
      const lac = cell.lac ?? 0;
      const cid = cell.cid ?? 0;
      const bsic = "";
      const arfcn = "";
      const description = renderDescription(cell, options);
      return `G;${mcc};${mnc};${lac};${cid};${bsic};${arfcn};${lat};${lon};${accuracy};${description}`;
    }
    case "UMTS": {
      const lac = cell.lac ?? 0;
      const cid = cell.cid ?? 0;
      const psc = "";
      const uarfcn = cell.arfcn ?? "";
      const description = renderDescription(cell, options);
      return `W;${mcc};${mnc};${lac};${cid};${psc};${uarfcn};${lat};${lon};${accuracy};${description}`;
    }
    case "LTE": {
      const tac = cell.tac ?? 0;
      const ci = cell.ecid ?? 0;
      const pci = cell.pci ?? "";
      const earfcn = getEARFCN(cell.operator_mnc, cell.band_value, cell.band_duplex);
      const description = renderDescription(cell, options);
      return `L;${mcc};${mnc};${tac};${ci};${pci};${earfcn !== NTM_UNKNOWN ? earfcn : ""};${lat};${lon};${accuracy};${description}`;
    }
    case "NR": {
      const tac = cell.nrtac ?? 0;
      const nci = cell.nci ?? 0;
      const pci = cell.pci ?? "";
      const arfcn = cell.arfcn ?? "";
      const description = renderDescription(cell, options);
      return `N;${mcc};${mnc};${tac};${nci};${pci};${arfcn};${lat};${lon};${accuracy};${description}`;
    }
    case "CDMA": {
      const nid = 0;
      const bid = cell.cid ?? 0;
      const sid = 0;
      const description = renderDescription(cell, options);
      return `C;${mcc};${mnc};${nid};${bid};${sid};;${lat};${lon};${accuracy};${description}`;
    }
    default:
      return null;
  }
}

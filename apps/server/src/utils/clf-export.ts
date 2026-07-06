export type ClfFormat = "2.0" | "2.1" | "3.0-dec" | "3.0-hex" | "4.0" | "ntm" | "netmonitor";

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
  band_value?: number | null;
  band_name: string;
  band_duplex?: "FDD" | "TDD" | null;
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

function getNrDesignation(bandValue: number | null | undefined, duplex: "FDD" | "TDD" | null | undefined): string | null {
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

function getNTMLocation(cell: CellExportData): string {
  const parts: string[] = [];
  const locationParts = [cell.city, cell.address].filter(Boolean).join(", ");
  if (locationParts) parts.push(locationParts);
  if (cell.notes) parts.push(cell.notes);
  const description = withSectorPrefix(cell, parts.join(" - ") || cell.station_id).replace(/;/g, ",");
  return !cell.is_confirmed ? `[!] ${description}` : description;
}

function getBandCode(
  rat: "GSM" | "UMTS" | "LTE",
  bandValue: number | null | undefined,
  bandDuplex: "FDD" | "TDD" | null | undefined,
  e_gsm?: boolean | null,
): string | null {
  if (!bandValue) return null;
  switch (rat) {
    case "GSM":
      return `${e_gsm ? "E" : "G"}${bandValue}`;
    case "UMTS":
      return `U${bandValue}`;
    case "LTE":
      return `L${bandValue}${bandDuplex ?? ""}`;
  }
}

export function toCLF20(cell: CellExportData): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac;
  const cellId = getCellIdForExport(cell);
  if (!cellId || !lac) return null;

  const cellHex = cellId.toString(16).toUpperCase().padStart(4, "0");
  const lacHex = lac.toString(16).toUpperCase().padStart(4, "0");
  const mccmnc = cell.operator_mnc;
  const description = getDescription(cell) + getTags(cell);

  return `${cellHex}${lacHex}${mccmnc}\t${description}`;
}

export function toCLF21(cell: CellExportData): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac;
  const cellId = getCellIdForExport(cell);
  if (!cellId || !lac) return null;

  const cellDec = cellId.toString().padStart(5, "0");
  const lacDec = lac.toString().padStart(5, "0");
  const mccmnc = cell.operator_mnc;
  const description = getDescription(cell) + getTags(cell);

  return `${cellDec}${lacDec}${mccmnc}\t${description}`;
}

export function toCLF30Hex(cell: CellExportData): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac ?? 0;
  const cellId = getCellIdForExport(cell);
  if (!cellId) return null;

  const mccmnc = cell.operator_mnc;
  const cidHex = `0x${cellId.toString(16).toUpperCase().padStart(4, "0")}`;
  const lacHex = `0x${lac.toString(16).toUpperCase().padStart(4, "0")}`;
  const rncHex = `0x${(cell.rnc ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
  const lat = cell.latitude ?? 0;
  const lon = cell.longitude ?? 0;
  const posRat = cell.latitude !== null && cell.latitude !== undefined && cell.longitude !== null && cell.longitude !== undefined ? -1 : 0;
  const description = getDescription(cell) + getTags(cell);

  return `${mccmnc};${cidHex};${lacHex};${rncHex};${lat};${lon};${posRat};${description};0`;
}

export function toCLF30Dec(cell: CellExportData): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac ?? 0;
  const cellId = getCellIdForExport(cell);
  if (!cellId) return null;

  const mccmnc = cell.operator_mnc;
  const cidDec = cellId.toString().padStart(5, "0");
  const lacDec = lac.toString().padStart(5, "0");
  const rncDec = (cell.rnc ?? 0).toString().padStart(5, "0");
  const lat = cell.latitude ?? 0;
  const lon = cell.longitude ?? 0;
  const posRat = cell.latitude !== null && cell.latitude !== undefined && cell.longitude !== null && cell.longitude !== undefined ? -1 : 0;
  const description = getDescription(cell) + getTags(cell);

  return `${mccmnc};${cidDec};${lacDec};${rncDec};${lat};${lon};${posRat};${description};0`;
}

export function toCLF40(cell: CellExportData): string | null {
  const lac = cell.lac ?? cell.tac ?? cell.nrtac ?? 0;
  const cellId = getCellIdForExport(cell);
  if (!cellId) return null;

  const mccmnc = cell.operator_mnc;
  const cidFormatted = cellId.toString().padStart(5, "0");
  const lacFormatted = lac.toString().padStart(5, "0");
  const type = 0;
  const lat = cell.latitude ?? 0;
  const lon = cell.longitude ?? 0;
  const posRat = cell.latitude !== null && cell.latitude !== undefined && cell.longitude !== null && cell.longitude !== undefined ? -1 : 0;
  const description = getDescription(cell) + getTags(cell);
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
function getRatCode(rat: "GSM" | "CDMA" | "UMTS" | "LTE" | "NR" | "IOT"): number {
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
    default:
      return 0;
  }
}

function getDescription(cell: CellExportData): string {
  const parts: string[] = [];
  const locationParts = [cell.city, cell.address].filter(Boolean).join(", ");
  if (locationParts) parts.push(locationParts);
  if (cell.notes) parts.push(cell.notes);

  const description = withSectorPrefix(cell, parts.join(" - ") || cell.station_id).replace(/;/g, ",");
  return cell.is_confirmed === false ? `[!] ${description}` : description;
}

function withSectorPrefix(cell: CellExportData, description: string): string {
  if (cell.sector_index === undefined || cell.sector_azimuth === undefined) return description;
  return `[S${cell.sector_index}: ${cell.sector_azimuth}°] ${description}`;
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

function formatNRBandPCIsTag(nr_band_pcis: NRBandPCIs[]): string | null {
  const entries = nr_band_pcis
    .map((b) => ({
      desig: getNrDesignation(b.value, b.duplex),
      pcis: uniqueNRPcis(b.pcis).sort((a, c) => a.value - c.value),
      has_missing_pci: b.has_missing_pci,
    }))
    .filter((b): b is { desig: string; pcis: Array<{ value: number; is_confirmed: boolean | null }>; has_missing_pci: boolean } => b.desig !== null)
    .sort((a, b) => Number.parseInt(a.desig.slice(1), 10) - Number.parseInt(b.desig.slice(1), 10));
  if (entries.length === 0) return null;
  const parts = entries.map((b) => {
    if (b.pcis.length === 0) return `${b.desig}${b.has_missing_pci ? "!" : ""}`;
    const pcis = b.pcis.map((pci) => `${pci.value}${pci.is_confirmed === false ? "!" : ""}`);
    return `${b.desig}:${pcis.join(",")}`;
  });
  return `NR ${parts.join(" / ")}`;
}

function getTags(cell: CellExportData): string {
  let tags = "";
  const rc = cell.region_code ?? "UNKWN";
  switch (cell.rat) {
    case "GSM": {
      const bandCode = getBandCode("GSM", cell.band_value, cell.band_duplex, cell.e_gsm);
      if (bandCode) tags += ` [${rc}:${cell.station_id}:${bandCode}]`;
      break;
    }
    case "UMTS": {
      const rnc = cell.rnc ?? NTM_UNKNOWN;
      const uarfcn = cell.arfcn ?? NTM_UNKNOWN;
      const bandCode = getBandCode("UMTS", cell.band_value, cell.band_duplex);
      if (bandCode) tags += ` [${rc}:${cell.station_id}:${rnc}:${bandCode}-${uarfcn}]`;
      break;
    }
    case "LTE": {
      const bandCode = getBandCode("LTE", cell.band_value, cell.band_duplex);
      if (bandCode) tags += ` [${rc}:${cell.station_id}:${bandCode}]`;
      if (cell.enbid !== null && cell.enbid !== undefined && cell.clid !== null && cell.clid !== undefined)
        tags += ` [eNBI:${cell.enbid}:${cell.clid}]`;
      if (cell.nr_band_pcis && cell.nr_band_pcis.length > 0) {
        const formatted = formatNRBandPCIsTag(cell.nr_band_pcis);
        if (formatted) tags += ` [${formatted}]`;
      }
      break;
    }
    case "NR": {
      if (cell.nr_band_pcis && cell.nr_band_pcis.length > 0) {
        const formatted = formatNRBandPCIsTag(cell.nr_band_pcis);
        if (formatted) tags += ` [${formatted}]`;
      } else {
        const nrDesig = getNrDesignation(cell.band_value, cell.band_duplex);
        if (nrDesig) tags += ` [NR ${nrDesig}]`;
      }
      break;
    }
  }
  return tags;
}

export function convertToCLF(cell: CellExportData, format: ClfFormat): string | null {
  switch (format) {
    case "2.0":
      return toCLF20(cell);
    case "2.1":
      return toCLF21(cell);
    case "3.0-dec":
      return toCLF30Dec(cell);
    case "3.0-hex":
      return toCLF30Hex(cell);
    case "4.0":
      return toCLF40(cell);
    case "ntm":
      return toNTM(cell);
    case "netmonitor":
      return toNetMonitor(cell);
    default:
      return null;
  }
}

export function toNTM(cell: CellExportData): string | null {
  const mcc = "260";
  const mnc = cell.operator_mnc?.toString().slice(-2).padStart(2, "0") ?? "00";
  const lat = cell.latitude ?? 0;
  const lon = cell.longitude ?? 0;
  const rc = cell.region_code ?? "UNKWN";

  switch (cell.rat) {
    case "GSM": {
      const cid = cell.cid ?? NTM_UNKNOWN;
      const lac = cell.lac ?? NTM_UNKNOWN;
      let location = getNTMLocation(cell);
      const bandCode = getBandCode("GSM", cell.band_value, cell.band_duplex, cell.e_gsm);
      if (bandCode) location += ` [${rc}:${cell.station_id}:${bandCode}]`;
      return `2G;${mcc};${mnc};${cid};${lac};${NTM_UNKNOWN};${NTM_UNKNOWN};${lat};${lon};${location};${NTM_UNKNOWN}`;
    }
    case "UMTS": {
      const cid = cell.cid ?? NTM_UNKNOWN;
      const lac = cell.lac ?? NTM_UNKNOWN;
      const rnc = cell.rnc ?? NTM_UNKNOWN;
      const uarfcn = cell.arfcn ?? NTM_UNKNOWN;
      let location = getNTMLocation(cell);
      const bandCode = getBandCode("UMTS", cell.band_value, cell.band_duplex);
      if (bandCode) location += ` [${rc}:${cell.station_id}:${rnc}:${bandCode}-${uarfcn}]`;
      return `3G;${mcc};${mnc};${cid};${lac};${rnc};${NTM_UNKNOWN};${lat};${lon};${location};${uarfcn}`;
    }
    case "LTE": {
      const ci = cell.clid ?? NTM_UNKNOWN;
      const tac = cell.tac ?? NTM_UNKNOWN;
      const enbid = cell.enbid ?? NTM_UNKNOWN;
      const pci = cell.pci ?? NTM_UNKNOWN;
      const earfcn = cell.arfcn ?? NTM_UNKNOWN;

      let location = getNTMLocation(cell);
      const bandCode = getBandCode("LTE", cell.band_value, cell.band_duplex);
      if (bandCode) location += ` [${rc}:${cell.station_id}:${bandCode}]`;
      if (cell.enbid !== null && cell.enbid !== undefined && cell.clid !== null && cell.clid !== undefined)
        location += ` [eNBI:${cell.enbid}:${cell.clid}]`;
      if (cell.nr_band_pcis && cell.nr_band_pcis.length > 0) {
        const formatted = formatNRBandPCIsTag(cell.nr_band_pcis);
        if (formatted) location += ` [${formatted}]`;
      }

      return `4G;${mcc};${mnc};${ci};${tac};${enbid};${pci};${lat};${lon};${location};${earfcn}`;
    }
    case "NR": {
      const nci = cell.nci ?? NTM_UNKNOWN;
      const tac = cell.nrtac ?? NTM_UNKNOWN;
      const pci = cell.pci ?? NTM_UNKNOWN;
      const arfcn = cell.arfcn ?? NTM_UNKNOWN;

      let location = getNTMLocation(cell);
      if (cell.nr_band_pcis && cell.nr_band_pcis.length > 0) {
        const formatted = formatNRBandPCIsTag(cell.nr_band_pcis);
        if (formatted) location += ` [${formatted}]`;
      } else {
        const nrDesig = getNrDesignation(cell.band_value, cell.band_duplex);
        if (nrDesig) location += ` [NR ${nrDesig}]`;
      }

      return `5G;${mcc};${mnc};${nci};${tac};;${pci};${lat};${lon};${location};${arfcn}`;
    }
    case "CDMA": {
      const bid = cell.cid ?? NTM_UNKNOWN;
      return `CD2;${mcc};${mnc};${bid};${NTM_UNKNOWN};;${NTM_UNKNOWN};${lat};${lon};${getNTMLocation(cell)};`;
    }
    default:
      return null;
  }
}

export function sortCLFLines(lines: string[]): string[] {
  return lines.sort();
}

export function toNetMonitor(cell: CellExportData): string | null {
  const mcc = "260";
  const mnc = cell.operator_mnc?.toString().slice(-2).padStart(2, "0") ?? "00";
  const lat = cell.latitude ?? "";
  const lon = cell.longitude ?? "";
  const accuracy = 100;
  const rc = cell.region_code ?? "UNKWN";
  const description = (getDescription(cell) + getTags(cell)).replace(/;/g, ",");

  switch (cell.rat) {
    case "GSM": {
      const lac = cell.lac ?? 0;
      const cid = cell.cid ?? 0;
      const bsic = "";
      const arfcn = "";
      return `G;${mcc};${mnc};${lac};${cid};${bsic};${arfcn};${lat};${lon};${accuracy};${description}`;
    }
    case "UMTS": {
      const lac = cell.lac ?? 0;
      const cid = cell.cid ?? 0;
      const psc = "";
      const uarfcn = cell.arfcn ?? "";
      const rnc = cell.rnc ?? NTM_UNKNOWN;
      const uarfcnForDesc = cell.arfcn ?? NTM_UNKNOWN;
      let umtsDescription = getNTMLocation(cell);
      const bandCode = getBandCode("UMTS", cell.band_value, cell.band_duplex);
      if (bandCode) umtsDescription += ` [${rc}:${cell.station_id}:${rnc}:${bandCode}-${uarfcnForDesc}]`;
      return `W;${mcc};${mnc};${lac};${cid};${psc};${uarfcn};${lat};${lon};${accuracy};${umtsDescription.replace(/;/g, ",")}`;
    }
    case "LTE": {
      const tac = cell.tac ?? 0;
      const ci = cell.ecid ?? 0;
      const pci = cell.pci ?? "";
      const earfcn = getEARFCN(cell.operator_mnc, cell.band_value, cell.band_duplex);
      return `L;${mcc};${mnc};${tac};${ci};${pci};${earfcn !== NTM_UNKNOWN ? earfcn : ""};${lat};${lon};${accuracy};${description}`;
    }
    case "NR": {
      const tac = cell.nrtac ?? 0;
      const nci = cell.nci ?? 0;
      const pci = cell.pci ?? "";
      const arfcn = cell.arfcn ?? "";
      return `N;${mcc};${mnc};${tac};${nci};${pci};${arfcn};${lat};${lon};${accuracy};${description}`;
    }
    case "CDMA": {
      const nid = 0;
      const bid = cell.cid ?? 0;
      const sid = 0;
      return `C;${mcc};${mnc};${nid};${bid};${sid};;${lat};${lon};${accuracy};${description}`;
    }
    default:
      return null;
  }
}

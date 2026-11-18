import { conventionsFor } from "@openbts/country-packs";
import { resolveCatalogBand } from "@openbts/shared/bandCatalog";
import { CELL_TYPE_SHORT_LABELS, type CellType } from "@openbts/shared/cellTypes";
import type { CountryFeatures } from "@openbts/shared/contract";
import { GNBID_MAX_LENGTH, GNBID_MIN_LENGTH, GSM_BAND_MHZ } from "@openbts/shared/contract/constants";

import { disabledCountryFeatures } from "../stations/countryFeatures.js";
import { type CellExportData, getMccMnc, sanitizeDescription } from "./converter.js";
import type { ExportedCell } from "./lines.js";

type CelldexRat = "GSM" | "UMTS" | "LTE" | "NR";
type CellIdentity = { text: string; sortKey: bigint };
type CellLine = { rat: CelldexRat; identity: CellIdentity | null; channel: number | null; code: number | null; keys: string[] };
type CelldexNetwork = { mnc: number | null; countryCode: string | null };
type LineRadio = { code: number | null; gnbidLength: number | null };
type SiteContext = {
  plmn: string;
  gnbidLength: number;
  features: CountryFeatures;
  extraCodes: ReadonlyMap<number, readonly string[]>;
};

const VERSION_LINE = "celldex 1";
const INDENT = "  ";
const NO_IDENTITY = "-";
const NO_POSITION = "- -";
const COORDINATE_DECIMALS = 7;
const NCI_BITS = 36n;
const CID_BITS = 16n;
const LTE_CID_BITS = 8n;
const UMTS_RNC_MAX = 4095;
const FULL_CIRCLE = 360;
const RAT_ORDER: readonly CelldexRat[] = ["NR", "LTE", "UMTS", "GSM"];
const RAT_NAMES: Record<CelldexRat, string> = { GSM: "gsm", UMTS: "umts", LTE: "lte", NR: "nr" };
const QUOTED_ESCAPES: Partial<Record<string, string>> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\t": "\\t" };
const BARE_TEXT = /^[A-Za-z0-9._:/+,-]+$/;

function quote(text: string): string {
  const escaped = text.replace(/\r\n?/g, "\n").replace(/[\\"\n\t]/g, (character) => QUOTED_ESCAPES[character] ?? character);
  return `"${escaped}"`;
}

function textValue(text: string): string {
  return BARE_TEXT.test(text) ? text : quote(text);
}

function formatCoordinate(value: number): string {
  const text = value.toFixed(COORDINATE_DECIMALS).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

function formatPosition(latitude: number | null | undefined, longitude: number | null | undefined): string {
  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return NO_POSITION;
  return `${formatCoordinate(latitude)} ${formatCoordinate(longitude)}`;
}

function plmnOf(operatorMnc: number | null | undefined): string {
  const { mcc, mnc } = getMccMnc({ operator_mnc: operatorMnc });
  return mcc + mnc;
}

function gnbidLengthOf(plmn: string, countryCode: string | null): number {
  return conventionsFor(countryCode).gnbidLength({ primaryPlmn: plmn });
}

function isCelldexRat(rat: CellExportData["rat"]): rat is CelldexRat {
  return rat !== "CDMA";
}

function splitIdentity(first: number, second: number, secondBits: bigint): CellIdentity {
  return { text: `${first}/${second}`, sortKey: (BigInt(first) << secondBits) | BigInt(second) };
}

function identityOf(cell: CellExportData, gnbidLength: number): CellIdentity | null {
  switch (cell.rat) {
    case "GSM":
      return typeof cell.lac === "number" ? splitIdentity(cell.lac, cell.cid, CID_BITS) : null;
    case "UMTS":
      return typeof cell.rnc === "number" && cell.rnc > 0 && cell.rnc <= UMTS_RNC_MAX ? splitIdentity(cell.rnc, cell.cid, CID_BITS) : null;
    case "LTE":
      return typeof cell.enbid === "number" && cell.enbid > 0 && typeof cell.clid === "number"
        ? splitIdentity(cell.enbid, cell.clid, LTE_CID_BITS)
        : null;
    case "NR": {
      if (cell.nci === null || cell.nci === undefined) return null;
      const cellBits = NCI_BITS - BigInt(gnbidLength);
      const gnbid = cell.nci >> cellBits;
      return gnbid === 0n ? null : { text: `${gnbid}/${cell.nci & ((1n << cellBits) - 1n)}`, sortKey: cell.nci };
    }
    default:
      return null;
  }
}

function storedGnbidLengthOf(cell: CellExportData): number | null {
  const length = cell.gnbid_length;
  return typeof length === "number" && length >= GNBID_MIN_LENGTH && length <= GNBID_MAX_LENGTH ? length : null;
}

function codeOf(cell: CellExportData, features: CountryFeatures): number | null {
  if (cell.rat === "GSM") return features.bsic ? (cell.bsic ?? null) : null;
  if (cell.rat === "UMTS") return features.psc ? (cell.psc ?? null) : null;
  return cell.pci ?? null;
}

function gsmBandMhzOf(cell: CellExportData): number | null {
  return typeof cell.band_value === "number" && GSM_BAND_MHZ.has(cell.band_value) ? cell.band_value : null;
}

function radioKeys(cell: CellExportData, { code, gnbidLength }: LineRadio): [key: string, value: number | null | undefined][] {
  const band = resolveCatalogBand({ rat: cell.rat, value: cell.band_value, duplex: cell.band_duplex, code: cell.band_code })?.number;
  switch (cell.rat) {
    case "GSM":
      return [
        ["bsic", code],
        ["band", gsmBandMhzOf(cell)],
      ];
    case "UMTS":
      return [
        ["lac", cell.lac],
        ["psc", code],
        ["ch", cell.arfcn],
        ["band", typeof cell.arfcn === "number" ? null : band],
      ];
    case "LTE":
      return [
        ["tac", cell.tac],
        ["pci", code],
        ["ch", cell.arfcn],
        ["band", typeof cell.arfcn === "number" ? null : band],
      ];
    case "NR":
      return [
        ["tac", cell.nrtac],
        ["pci", code],
        ["ch", cell.arfcn],
        ["band", band],
        ["gnb", gnbidLength],
      ];
    default:
      return [];
  }
}

function keysOf(cell: CellExportData, radio: LineRadio, plmn: string, extraCodes: readonly string[]): string[] {
  const keys = radioKeys(cell, radio).flatMap(([key, value]) => (typeof value === "number" ? [`${key}=${value}`] : []));
  const plmns = extraCodes.filter((code) => code !== plmn);
  if (plmns.length > 0) keys.push(`plmns=${plmns.join(",")}`);
  if (cell.sector_azimuth !== undefined) keys.push(`az=${cell.sector_azimuth % FULL_CIRCLE}`);
  if (cell.cell_type) keys.push(`type=${CELL_TYPE_SHORT_LABELS[cell.cell_type as CellType]}`);
  if (cell.rat === "NR" && cell.nr_type === "nsa") keys.push("nsa");
  return keys;
}

function compareKnownFirst<T extends number | bigint>(a: T | null, b: T | null): number {
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareLines(a: CellLine, b: CellLine): number {
  return (
    RAT_ORDER.indexOf(a.rat) - RAT_ORDER.indexOf(b.rat) ||
    compareKnownFirst(a.identity?.sortKey ?? null, b.identity?.sortKey ?? null) ||
    compareKnownFirst(a.channel, b.channel) ||
    compareKnownFirst(a.code, b.code)
  );
}

function siteNameOf(cell: CellExportData): string {
  const location = sanitizeDescription([cell.city, cell.address].filter(Boolean).join(", "));
  return location === "" ? `#[${cell.station_id}]` : `#[${cell.station_id}] ${location}`;
}

function cellLinesOf({ cellPk, cell }: ExportedCell, site: SiteContext): CellLine[] {
  if (!isCelldexRat(cell.rat)) return [];

  const gnbidLength = storedGnbidLengthOf(cell) ?? site.gnbidLength;
  const identity = identityOf(cell, gnbidLength);
  const radio = { code: codeOf(cell, site.features), gnbidLength: identity !== null && gnbidLength !== site.gnbidLength ? gnbidLength : null };
  const keys = keysOf(cell, radio, site.plmn, site.extraCodes.get(cellPk) ?? []);
  return [{ rat: cell.rat, identity, channel: cell.arfcn ?? null, code: radio.code, keys }];
}

function writeSite(
  cells: readonly ExportedCell[],
  extraCodes: ReadonlyMap<number, readonly string[]>,
  featuresByCountry: ReadonlyMap<string | null, CountryFeatures>,
): string[] {
  const [first] = cells;
  if (first === undefined) return [];

  const { cell: site, countryCode } = first;
  const plmn = plmnOf(site.operator_mnc);
  const features = featuresByCountry.get(countryCode) ?? disabledCountryFeatures;
  const siteContext: SiteContext = { plmn, gnbidLength: gnbidLengthOf(plmn, countryCode), features, extraCodes };
  const siteParts = ["site", plmn, formatPosition(site.latitude, site.longitude), quote(siteNameOf(site)), `id=${textValue(site.station_id)}`];
  if (site.structure_owner) siteParts.push(`owner=${quote(site.structure_owner)}`);
  if (site.structure_note) siteParts.push(`note=${quote(site.structure_note)}`);

  const lines = cells.flatMap((entry) => cellLinesOf(entry, siteContext)).sort(compareLines);
  const ratWidth = Math.max(...lines.map((line) => RAT_NAMES[line.rat].length));
  const identityWidth = Math.max(...lines.map((line) => (line.identity?.text ?? NO_IDENTITY).length));
  const cellLines = lines.map((line) => {
    const rat = RAT_NAMES[line.rat].padEnd(ratWidth);
    const identity = (line.identity?.text ?? NO_IDENTITY).padEnd(identityWidth);
    return `${INDENT}${rat} ${identity}${line.keys.map((key) => ` ${key}`).join("")}`.trimEnd();
  });
  return ["", siteParts.join(" "), ...cellLines];
}

export function writeCelldexHeader(networks: readonly CelldexNetwork[]): string {
  const netLines = new Map(
    networks.map(({ mnc, countryCode }) => {
      const plmn = plmnOf(mnc);
      return [plmn, `net ${plmn} gnb=${gnbidLengthOf(plmn, countryCode)}`];
    }),
  );
  const sortedNetLines = [...netLines].sort(([a], [b]) => a.localeCompare(b)).map(([, line]) => line);
  return [VERSION_LINE, ...sortedNetLines].map((line) => `${line}\n`).join("");
}

export function writeCelldexSites(
  exported: readonly ExportedCell[],
  extraCodes: ReadonlyMap<number, readonly string[]>,
  featuresByCountry: ReadonlyMap<string | null, CountryFeatures>,
): string[] {
  const byStation = Map.groupBy(exported, (entry) => entry.stationPk);
  return [...byStation].sort(([a], [b]) => a - b).flatMap(([, cells]) => writeSite(cells, extraCodes, featuresByCountry));
}

import type { LabelRat, LocalFile, PermitLabel, ReadContext, Release, SiteRecord, SiteSector } from "../../../core/sources.ts";
import { inflateZipEntry, openZip } from "../../../core/zip.ts";
import { readCsvRows } from "./csv.ts";
import { DEPARTMENT_SLICES, UNKNOWN_DEPARTMENT_SLICE, departmentOf, regionIsoCodeOf } from "./departments.ts";

const ONE_ARCSECOND_IN_METERS = 31;
const MICRODEGREES_PER_DEGREE = 1e6;
const REQUIRED_COLUMNS = ["adm_lb_nom", "sup_id", "emr_lb_systeme", "sta_nm_dpt", "sta_nm_anfr", "coordonnees"] as const;
const ADDRESS_COLUMNS = ["adr_lb_lieu", "adr_lb_add1", "adr_lb_add2", "adr_lb_add3"] as const;
const RATS: Readonly<Record<string, LabelRat>> = { GSM: "GSM", UMTS: "UMTS", LTE: "LTE", "5G NR": "NR" };
const SYSTEM = /^(GSM|UMTS|LTE|5G NR)\s+(\d+)$/i;
const KNOWN_SLICES: ReadonlySet<string> = new Set(DEPARTMENT_SLICES);

type ColumnName = (typeof REQUIRED_COLUMNS)[number] | (typeof ADDRESS_COLUMNS)[number] | "adr_nm_cp" | "list_azimut";
type Row = (column: ColumnName) => string;

export function labelOfSystem(system: string): PermitLabel | null {
  const match = SYSTEM.exec(system.trim().replace(/\s+/g, " "));
  if (!match) return null;

  const rat = RATS[match[1]!.toUpperCase()];
  return rat ? { rat, mhz: Number(match[2]), variant: "commercial" } : null;
}

function roundToMicrodegrees(degrees: number): number {
  return Math.round(degrees * MICRODEGREES_PER_DEGREE) / MICRODEGREES_PER_DEGREE;
}

export function parseCoordinates(published: string): { latitude: number; longitude: number } | null {
  const [latitude, longitude, ...rest] = published.split(",").map((part) => Number(part.trim()));
  if (rest.length > 0 || latitude === undefined || longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude: roundToMicrodegrees(latitude), longitude: roundToMicrodegrees(longitude) };
}

export function parseAzimuths(published: string): SiteSector[] {
  return published
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map(Number)
    .filter((azimuth) => Number.isFinite(azimuth) && azimuth >= 0 && azimuth <= 360)
    .map((azimuth) => ({ azimuth, elevation: null, antennaHeight: null, antennaPlacement: null }));
}

function addressOf(row: Row): string | null {
  const lines = ADDRESS_COLUMNS.map(row).filter((line) => line !== "");
  const postalCode = row("adr_nm_cp");
  if (postalCode !== "") lines.push(postalCode);
  return lines.length > 0 ? lines.join(", ") : null;
}

function rowReaderOf(header: readonly string[]): (cells: readonly string[]) => Row {
  const positions = new Map(header.map((name, position) => [name.trim().toLowerCase(), position]));
  const missing = REQUIRED_COLUMNS.filter((column) => !positions.has(column));
  if (missing.length > 0) throw new Error(`The ANFR file has no column ${missing.join(", ")}. Its header is: ${header.join(", ")}`);

  return (cells) => (column) => {
    const position = positions.get(column);
    return position === undefined ? "" : (cells[position] ?? "").trim();
  };
}

function sliceOf(department: string): string {
  return KNOWN_SLICES.has(department) ? department : UNKNOWN_DEPARTMENT_SLICE;
}

function recordOf(ctx: ReadContext, row: Row, firstLocationOfStation: Map<string, SiteRecord["location"]>): SiteRecord | null {
  const department = departmentOf(row("sta_nm_dpt"));
  const slice = sliceOf(department);
  const regionIsoCode = regionIsoCodeOf(department);
  if (regionIsoCode === null) {
    ctx.skip(slice, "territory_not_imported");
    return null;
  }

  const coordinates = parseCoordinates(row("coordonnees"));
  if (coordinates === null) {
    ctx.skip(slice, "bad_coordinates");
    return null;
  }

  const licensee = row("adm_lb_nom");
  const supportId = row("sup_id");
  const stationNumber = row("sta_nm_anfr");
  if (licensee === "" || supportId === "" || stationNumber === "") {
    ctx.skip(slice, "missing_identity");
    return null;
  }

  const label = labelOfSystem(row("emr_lb_systeme"));
  if (label === null) {
    ctx.skip(slice, "unknown_system");
    return null;
  }

  const location = firstLocationOfStation.get(stationNumber) ?? {
    ...coordinates,
    city: null,
    address: addressOf(row),
    regionIsoCode,
    ref: supportId,
    precisionMeters: ONE_ARCSECOND_IN_METERS,
  };
  firstLocationOfStation.set(stationNumber, location);

  return {
    slice,
    location,
    site: { siteId: null, licensee, name: null, ref: stationNumber },
    permit: { label, number: null, decisionType: null, expiresOn: null },
    sectors: parseAzimuths(row("list_azimut")),
  };
}

export async function* parseMobileNetworks(ctx: ReadContext, _release: Release, files: readonly LocalFile[]): AsyncGenerator<SiteRecord> {
  const [file] = files;
  if (!file) throw new Error("The ANFR release has no file");

  const archive = await openZip(file.path);
  const entry = [...archive.entries.values()].find((candidate) => candidate.name.toLowerCase().endsWith(".csv"));
  if (!entry) throw new Error(`"${file.fileName}" holds no CSV file`);

  const firstLocationOfStation = new Map<string, SiteRecord["location"]>();
  let rowOf: ((cells: readonly string[]) => Row) | null = null;
  for await (const cells of readCsvRows(inflateZipEntry(archive, entry))) {
    if (rowOf === null) {
      rowOf = rowReaderOf(cells);
      continue;
    }
    if (cells.length === 1 && cells[0] === "") continue;

    const record = recordOf(ctx, rowOf(cells), firstLocationOfStation);
    if (record !== null) yield record;
  }
}

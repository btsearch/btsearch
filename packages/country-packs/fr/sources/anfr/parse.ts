import type { LabelRat, LocalFile, PermitLabel, ReadContext, Release, SiteRecord, SiteSector } from "../../../core/sources.ts";
import { type ZipArchive, findZipEntry, inflateZipEntry, openZip } from "../../../core/zip.ts";
import { readCsvRows } from "./csv.ts";
import { DEPARTMENT_SLICES, UNKNOWN_DEPARTMENT_SLICE, departmentOf, regionIsoCodeOf } from "./departments.ts";

const ONE_ARCSECOND_IN_METERS = 31;
const MICRODEGREES_PER_DEGREE = 1e6;
const RATS: Readonly<Record<string, LabelRat>> = { GSM: "GSM", UMTS: "UMTS", LTE: "LTE", "5G NR": "NR" };
const SYSTEM = /^(GSM|UMTS|LTE|5G NR)\s+(\d+)$/i;
const KNOWN_SLICES: ReadonlySet<string> = new Set(DEPARTMENT_SLICES);
const ADDRESS_COLUMNS = ["ADR_LB_LIEU", "ADR_LB_ADD1", "ADR_LB_ADD2", "ADR_LB_ADD3"] as const;
const SUPPORT_COLUMNS = [
  "SUP_ID",
  "STA_NM_ANFR",
  "COR_NB_DG_LAT",
  "COR_NB_MN_LAT",
  "COR_NB_SC_LAT",
  "COR_CD_NS_LAT",
  "COR_NB_DG_LON",
  "COR_NB_MN_LON",
  "COR_NB_SC_LON",
  "COR_CD_EW_LON",
  ...ADDRESS_COLUMNS,
  "ADR_NM_CP",
] as const;
const INVALID_UTF8 = "ERR_ENCODING_INVALID_ENCODED_DATA";

type Row<Column extends string> = (column: Column) => string;
type Location = SiteRecord["location"];
type StationSystem = { antennaIds: number[]; isInService: boolean };
type Stations = ReadonlyMap<string, unknown>;

export function labelOfSystem(system: string): PermitLabel | null {
  const match = SYSTEM.exec(system.trim().replace(/\s+/g, " "));
  if (!match) return null;

  const rat = RATS[match[1]!.toUpperCase()];
  return rat ? { rat, mhz: Number(match[2]), variant: "commercial" } : null;
}

function numberOf(published: string): number | null {
  if (published === "") return null;

  const value = Number(published.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function angleOf(
  publishedDegrees: string,
  publishedMinutes: string,
  publishedSeconds: string,
  hemisphere: string,
  [positive, negative]: readonly [string, string],
): number | null {
  const degrees = numberOf(publishedDegrees);
  const minutes = numberOf(publishedMinutes);
  const seconds = numberOf(publishedSeconds);
  if (degrees === null || minutes === null || seconds === null || minutes >= 60 || seconds >= 60) return null;
  if (hemisphere !== positive && hemisphere !== negative) return null;

  const sign = hemisphere === positive ? 1 : -1;
  const angle = degrees + minutes / 60 + seconds / 3600;
  return (sign * Math.round(angle * MICRODEGREES_PER_DEGREE)) / MICRODEGREES_PER_DEGREE;
}

function coordinatesOf(row: Row<(typeof SUPPORT_COLUMNS)[number]>): { latitude: number; longitude: number } | null {
  const latitude = angleOf(row("COR_NB_DG_LAT"), row("COR_NB_MN_LAT"), row("COR_NB_SC_LAT"), row("COR_CD_NS_LAT"), ["N", "S"]);
  const longitude = angleOf(row("COR_NB_DG_LON"), row("COR_NB_MN_LON"), row("COR_NB_SC_LON"), row("COR_CD_EW_LON"), ["E", "W"]);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude, longitude };
}

function addressOf(row: Row<(typeof SUPPORT_COLUMNS)[number]>): string | null {
  const lines = ADDRESS_COLUMNS.map(row).filter((line) => line !== "");
  const postalCode = row("ADR_NM_CP");
  if (postalCode !== "") lines.push(postalCode);
  return lines.length > 0 ? lines.join(", ") : null;
}

function departmentOfStation(station: string): string {
  return departmentOf(station.slice(0, 3));
}

function sharedName(names: Map<string, string>, name: string): string {
  const known = names.get(name);
  if (known !== undefined) return known;

  names.set(name, name);
  return name;
}

function sliceOf(department: string): string {
  return KNOWN_SLICES.has(department) ? department : UNKNOWN_DEPARTMENT_SLICE;
}

function skipReasonOf(department: string, system: string): string | null {
  if (regionIsoCodeOf(department) === null) return "territory_not_imported";
  if (labelOfSystem(system) === null) return "unknown_system";
  return null;
}

function isInvalidUtf8(error: unknown): boolean {
  return error instanceof TypeError && "code" in error && error.code === INVALID_UTF8;
}

async function* readTable<Column extends string>(archive: ZipArchive, table: string, columns: readonly Column[]): AsyncGenerator<Row<Column>> {
  const entry = findZipEntry(archive, `${table}.txt`);
  if (!entry) throw new Error(`The ANFR archive holds no ${table}.txt`);

  let positions: ReadonlyMap<string, number> | null = null;
  try {
    for await (const cells of readCsvRows(inflateZipEntry(archive, entry))) {
      if (positions === null) {
        const header = new Map(cells.map((name, position) => [name.trim().toUpperCase(), position]));
        const missing = columns.filter((column) => !header.has(column));
        if (missing.length > 0) throw new Error(`${table}.txt has no column ${missing.join(", ")}. Its header is: ${cells.join(", ")}`);
        positions = header;
        continue;
      }
      if (cells.length === 1 && cells[0] === "") continue;

      const header = positions;
      yield (column) => (cells[header.get(column)!] ?? "").trim();
    }
  } catch (error) {
    if (isInvalidUtf8(error)) throw new Error(`${table}.txt is not UTF-8`, { cause: error });
    throw error;
  }
}

async function readLicenseeOfStation(data: ZipArchive, reference: ZipArchive, stations: Stations): Promise<Map<string, string>> {
  const operatorNames = new Map<string, string>();
  for await (const row of readTable(reference, "SUP_EXPLOITANT", ["ADM_ID", "ADM_LB_NOM"])) operatorNames.set(row("ADM_ID"), row("ADM_LB_NOM"));

  const licensees = new Map<string, string>();
  for await (const row of readTable(data, "SUP_STATION", ["STA_NM_ANFR", "ADM_ID"])) {
    const station = row("STA_NM_ANFR");
    const licensee = operatorNames.get(row("ADM_ID"));
    if (licensee && stations.has(station)) licensees.set(station, licensee);
  }
  return licensees;
}

async function readLocationOfStation(data: ZipArchive, stations: Stations): Promise<Map<string, Location | null>> {
  const locations = new Map<string, Location | null>();
  for await (const row of readTable(data, "SUP_SUPPORT", SUPPORT_COLUMNS)) {
    const station = row("STA_NM_ANFR");
    if (!stations.has(station) || locations.has(station)) continue;

    const coordinates = coordinatesOf(row);
    locations.set(
      station,
      coordinates === null
        ? null
        : {
            ...coordinates,
            city: null,
            address: addressOf(row),
            regionIsoCode: regionIsoCodeOf(departmentOfStation(station)),
            ref: row("SUP_ID"),
            precisionMeters: ONE_ARCSECOND_IN_METERS,
          },
    );
  }
  return locations;
}

async function readSectorsOfStation(data: ZipArchive, stations: Stations): Promise<Map<string, Map<number, SiteSector>>> {
  const sectorsOfStation = new Map<string, Map<number, SiteSector>>();
  for await (const row of readTable(data, "SUP_ANTENNE", ["STA_NM_ANFR", "AER_ID", "AER_FG_RAYON", "AER_NB_AZIMUT", "AER_NB_ALT_BAS"])) {
    const station = row("STA_NM_ANFR");
    if (!stations.has(station)) continue;

    const sectors = sectorsOfStation.get(station) ?? new Map<number, SiteSector>();
    sectorsOfStation.set(station, sectors);
    const azimuth = row("AER_FG_RAYON") === "N" ? null : numberOf(row("AER_NB_AZIMUT"));
    sectors.set(Number(row("AER_ID")), {
      azimuth: azimuth !== null && azimuth >= 0 && azimuth <= 360 ? azimuth : null,
      antennaHeight: numberOf(row("AER_NB_ALT_BAS")),
      antennaPlacement: null,
    });
  }
  return sectorsOfStation;
}

async function readSystemsOfStation(ctx: ReadContext, data: ZipArchive): Promise<Map<string, Map<string, StationSystem>>> {
  const systemsOfStation = new Map<string, Map<string, StationSystem>>();
  const systemNames = new Map<string, string>();
  const skipped = new Set<string>();
  for await (const row of readTable(data, "SUP_EMETTEUR", ["STA_NM_ANFR", "EMR_LB_SYSTEME", "AER_ID", "EMR_DT_SERVICE"])) {
    const station = row("STA_NM_ANFR");
    const system = sharedName(systemNames, row("EMR_LB_SYSTEME"));
    const antennaId = Number(row("AER_ID"));
    const isInService = row("EMR_DT_SERVICE") !== "";
    const known = systemsOfStation.get(station)?.get(system);
    if (known) {
      if (!known.antennaIds.includes(antennaId)) known.antennaIds = known.antennaIds.concat(antennaId);
      known.isInService ||= isInService;
      continue;
    }

    const skipKey = `${station}|${system}`;
    if (skipped.has(skipKey)) continue;

    const department = departmentOfStation(station);
    const skipReason = skipReasonOf(department, system);
    if (skipReason !== null) {
      skipped.add(skipKey);
      ctx.skip(sliceOf(department), skipReason);
      continue;
    }

    const systems = systemsOfStation.get(station) ?? new Map<string, StationSystem>();
    systemsOfStation.set(station, systems);
    systems.set(system, { antennaIds: [antennaId], isInService });
  }
  return systemsOfStation;
}

export async function* parseRadioInstallations(ctx: ReadContext, _release: Release, files: readonly LocalFile[]): AsyncGenerator<SiteRecord> {
  const [dataFile, referenceFile] = files;
  if (!dataFile || !referenceFile) throw new Error("The ANFR release needs its data and reference archives");

  const data = await openZip(dataFile.path);
  const reference = await openZip(referenceFile.path);
  const systemsOfStation = await readSystemsOfStation(ctx, data);
  const licenseeOfStation = await readLicenseeOfStation(data, reference, systemsOfStation);
  const locationOfStation = await readLocationOfStation(data, systemsOfStation);
  const sectorsOfStation = await readSectorsOfStation(data, systemsOfStation);

  for (const [station, systems] of systemsOfStation) {
    const slice = sliceOf(departmentOfStation(station));
    const licensee = licenseeOfStation.get(station);
    const location = locationOfStation.get(station);
    const sectors = sectorsOfStation.get(station);
    for (const [system, { antennaIds, isInService }] of systems) {
      if (licensee === undefined || location === undefined) {
        ctx.skip(slice, "missing_identity");
        continue;
      }
      if (location === null) {
        ctx.skip(slice, "bad_coordinates");
        continue;
      }

      yield {
        slice,
        location,
        site: { siteId: null, licensee, name: null, ref: station },
        permit: { label: labelOfSystem(system), number: null, decisionType: null, expiresOn: null, status: isInService ? "in_service" : "approved" },
        sectors: antennaIds.flatMap((antennaId) => sectors?.get(antennaId) ?? []),
      };
    }
    systemsOfStation.delete(station);
    sectorsOfStation.delete(station);
  }
}

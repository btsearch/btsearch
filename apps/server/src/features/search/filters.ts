import {
  bands,
  cells,
  extraIdentificators,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  operators,
  regions,
  stationSectors,
  stations,
  umtsCells,
} from "@openbts/drizzle";
import { CELL_TYPES, CELL_TYPE_SHORT_LABELS, type CellType } from "@openbts/shared/cellTypes";
import { MAX_ID } from "@openbts/shared/contract";
import { type SQL, and, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../constants.js";
import { ErrorResponse } from "../../errors.js";
import { buildHasPhotosCondition, buildHasSectorsCondition } from "../stations/filter.js";
import { buildUplinkCondition, isUplinkType } from "../stations/uplink.js";

export type FilterValue = string | number | boolean;
export type FilterTable = "stations" | "cells" | "gsmCells" | "umtsCells" | "lteCells" | "nrCells" | "locations" | "extraIdentificators";
type SearchFilterRefs = {
  locations: typeof locations;
  stations: typeof stations;
  cells: typeof cells;
  gsmCells: typeof gsmCells;
  umtsCells: typeof umtsCells;
  lteCells: typeof lteCells;
  nrCells: typeof nrCells;
  extraIdentificators: typeof extraIdentificators;
  bands: typeof bands;
  operators: typeof operators;
  regions: typeof regions;
  stationSectors: typeof stationSectors;
};
export const defaultFilterRefs: SearchFilterRefs = {
  locations,
  stations,
  cells,
  gsmCells,
  umtsCells,
  lteCells,
  nrCells,
  extraIdentificators,
  bands,
  operators,
  regions,
  stationSectors,
};
export type FilterCondition = {
  table: FilterTable;
  buildCondition: (value: FilterValue, refs: SearchFilterRefs) => SQL;
};

export const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const HEX_PREFIX_REGEX = /^0x([0-9a-f]+)$/i;
const HEX_LETTERS_REGEX = /^[0-9a-f]+$/i;
const EARLIEST_DATE = new Date("0001-01-01T00:00:00Z");
const LATEST_DATE = new Date("9999-12-31T00:00:00Z");
const parseNumericOrHex = (item: string): number => {
  const prefixMatch = HEX_PREFIX_REGEX.exec(item);
  if (prefixMatch) return Number.parseInt(prefixMatch[1]!, 16);
  if (/[a-f]/i.test(item) && HEX_LETTERS_REGEX.test(item)) return Number.parseInt(item, 16);
  return Number(item);
};

const numericListSchema = z
  .string()
  .transform((value) => splitList(value).map(parseNumericOrHex))
  .pipe(z.array(z.number().int()).min(1));
const int32ListSchema = numericListSchema.pipe(z.array(z.number().min(-MAX_ID).max(MAX_ID)));
const dateSchema = z.coerce.date().min(EARLIEST_DATE).max(LATEST_DATE);
const coordinatesSchema = z.tuple([z.coerce.number().min(-90).max(90), z.coerce.number().min(-180).max(180)]);
const stringListSchema = z
  .string()
  .transform((value) => splitList(value))
  .pipe(z.array(z.string().min(1)).min(1));
const ratListSchema = z
  .string()
  .transform((value) => splitList(value).map((item) => item.toUpperCase()))
  .pipe(z.array(z.enum(["GSM", "UMTS", "LTE", "NR"])).min(1));
const stationStatusListSchema = z
  .string()
  .transform((value) => splitList(value))
  .pipe(z.array(z.enum(["published", "pending", "inactive"])).min(1));
const booleanSchema = z.union([z.boolean(), z.string()]).transform((v) => v === true || v === "true");
const duplexListSchema = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === "boolean" ? [String(value)] : splitList(value)).map((item) => item.toUpperCase()))
  .pipe(z.array(z.enum(["FDD", "TDD", "NULL", "FALSE"])).min(1));

type DuplexValue = "FDD" | "TDD";

export function parseNumbers(v: FilterValue): number[] {
  return numericListSchema.parse(String(v));
}

function parseInt32s(v: FilterValue): number[] {
  return int32ListSchema.parse(String(v));
}

function parseDate(v: FilterValue): Date {
  return dateSchema.parse(String(v));
}

export function parseCoordinates(v: FilterValue): [number, number] {
  return coordinatesSchema.parse(splitList(String(v)));
}

function parseStrings(v: FilterValue): string[] {
  return stringListSchema.parse(String(v));
}

function parseCellTypes(v: FilterValue): CellType[] {
  const values = parseStrings(v).map((value) => {
    const normalized = value.toLowerCase();
    return CELL_TYPES.find((cellType) => cellType.toLowerCase() === normalized || CELL_TYPE_SHORT_LABELS[cellType] === normalized);
  });

  return z.array(z.enum(CELL_TYPES)).parse(values);
}

function parseRats(v: FilterValue): ("GSM" | "UMTS" | "LTE" | "NR")[] {
  return ratListSchema.parse(String(v));
}

function parseStationStatuses(v: FilterValue): ("published" | "pending" | "inactive")[] {
  return stationStatusListSchema.parse(String(v));
}

function parseBoolean(v: FilterValue): boolean {
  return booleanSchema.parse(v);
}

function parseDuplexValues(v: FilterValue): { duplexes: DuplexValue[]; includeUnknown: boolean } {
  const values = duplexListSchema.parse(v);
  return {
    duplexes: values.filter((value): value is DuplexValue => value === "FDD" || value === "TDD"),
    includeUnknown: values.some((value) => value === "NULL" || value === "FALSE"),
  };
}

const buildInArray =
  <T>(column: T, parser: (value: FilterValue) => readonly unknown[]) =>
  (value: FilterValue) =>
    inArray(column as never, parser(value));

const buildBooleanEq =
  <T>(column: T) =>
  (value: FilterValue) =>
    sql`${column as never} = ${parseBoolean(value)}`;

const buildLikeAny =
  <T>(column: T) =>
  (value: FilterValue) => {
    const values = parseStrings(value);
    const conditions = values.map((val) => sql`${column as never} ILIKE ${`%${val}%`}`);
    return (conditions.length === 1 ? conditions[0] : or(...conditions)) as SQL;
  };

const buildDateGte =
  <T>(column: T) =>
  (value: FilterValue) =>
    gte(column as never, parseDate(value));

const buildDateLte =
  <T>(column: T) =>
  (value: FilterValue) => {
    const date = parseDate(value);
    date.setHours(23, 59, 59, 999);
    return lte(column as never, date);
  };

const buildInArrayFromSubquery =
  <T>(column: T, buildSubquery: (values: number[]) => SQL) =>
  (value: FilterValue) =>
    inArray(column as never, buildSubquery(parseInt32s(value)));

const buildInArrayFromStringSubquery =
  <T>(column: T, buildSubquery: (values: string[]) => SQL) =>
  (value: FilterValue) =>
    inArray(column as never, buildSubquery(parseStrings(value)));

const buildDuplexCondition = (value: FilterValue, refs: SearchFilterRefs) => {
  const { duplexes, includeUnknown } = parseDuplexValues(value);
  const conditions: SQL[] = [];
  if (duplexes.length > 0)
    conditions.push(
      sql`${refs.bands.duplex} IN (${sql.join(
        duplexes.map((duplex) => sql`${duplex}`),
        sql`, `,
      )})`,
    );
  if (includeUnknown) conditions.push(sql`${refs.bands.duplex} IS NULL`);

  const where = (conditions.length === 1 ? conditions[0] : or(...conditions)) as SQL;
  return inArray(refs.cells.band_id, sql`(SELECT id FROM ${refs.bands} WHERE ${where})`);
};

export const FILTER_DEFINITIONS: Record<string, FilterCondition> = {
  // stations
  bts_id: {
    table: "stations",
    buildCondition: (value, refs) => buildLikeAny(refs.stations.station_id)(value),
  },
  mnc: {
    table: "stations",
    buildCondition: (value, refs) =>
      buildInArrayFromSubquery(refs.stations.operator_id, (values) => sql`(SELECT id FROM ${refs.operators} WHERE mnc IN ${values})`)(value),
  },
  status: {
    table: "stations",
    buildCondition: (value, refs) => buildInArray(refs.stations.status, parseStationStatuses)(value),
  },

  created_after: {
    table: "stations",
    buildCondition: (value, refs) => buildDateGte(refs.stations.createdAt)(value),
  },
  created_before: {
    table: "stations",
    buildCondition: (value, refs) => buildDateLte(refs.stations.createdAt)(value),
  },
  updated_after: {
    table: "stations",
    buildCondition: (value, refs) => buildDateGte(refs.stations.updatedAt)(value),
  },
  updated_before: {
    table: "stations",
    buildCondition: (value, refs) => buildDateLte(refs.stations.updatedAt)(value),
  },

  has_photo: {
    table: "stations",
    buildCondition: (value, refs) => buildHasPhotosCondition(refs.stations.id, parseBoolean(value)),
  },
  has_azimuth: {
    table: "stations",
    buildCondition: (value, refs) => buildHasSectorsCondition(refs.stationSectors, refs.stations.id, parseBoolean(value)),
  },
  uplink: {
    table: "stations",
    buildCondition: (value, refs) => buildUplinkCondition(refs.stations.id, parseStrings(value).filter(isUplinkType)),
  },

  // cells
  band: {
    table: "cells",
    buildCondition: (value, refs) =>
      buildInArrayFromSubquery(refs.cells.band_id, (values) => sql`(SELECT id FROM ${refs.bands} WHERE value IN ${values})`)(value),
  },
  duplex: {
    table: "cells",
    buildCondition: buildDuplexCondition,
  },
  rat: {
    table: "cells",
    buildCondition: (value, refs) => buildInArray(refs.cells.rat, parseRats)(value),
  },
  is_confirmed: {
    table: "cells",
    buildCondition: (value, refs) => buildBooleanEq(refs.cells.is_confirmed)(value),
  },
  cell_notes: {
    table: "cells",
    buildCondition: (value, refs) => buildLikeAny(refs.cells.notes)(value),
  },
  cell_type: {
    table: "cells",
    buildCondition: (value, refs) => buildInArray(refs.cells.type, parseCellTypes)(value),
  },

  // gsmCells
  lac: {
    table: "gsmCells",
    buildCondition: (value, refs) => buildInArray(refs.gsmCells.lac, parseInt32s)(value),
  },
  cid: {
    table: "gsmCells",
    buildCondition: (value, refs) => buildInArray(refs.gsmCells.cid, parseInt32s)(value),
  },

  // umtsCells
  rnc: {
    table: "umtsCells",
    buildCondition: (value, refs) => buildInArray(refs.umtsCells.rnc, parseInt32s)(value),
  },
  umts_cid: {
    table: "umtsCells",
    buildCondition: (value, refs) => buildInArray(refs.umtsCells.cid, parseInt32s)(value),
  },
  cid_long: {
    table: "umtsCells",
    buildCondition: (value, refs) => buildInArray(refs.umtsCells.cid_long, parseInt32s)(value),
  },
  umts_lac: {
    table: "umtsCells",
    buildCondition: (value, refs) => buildInArray(refs.umtsCells.lac, parseInt32s)(value),
  },
  uarfcn: {
    table: "umtsCells",
    buildCondition: (value, refs) => buildInArray(refs.umtsCells.arfcn, parseInt32s)(value),
  },

  // lteCells
  enbid: {
    table: "lteCells",
    buildCondition: (value, refs) => buildInArray(refs.lteCells.enbid, parseInt32s)(value),
  },
  ecid: {
    table: "lteCells",
    buildCondition: (value, refs) => buildInArray(refs.lteCells.ecid, parseInt32s)(value),
  },
  lte_clid: {
    table: "lteCells",
    buildCondition: (value, refs) => buildInArray(refs.lteCells.clid, parseInt32s)(value),
  },
  tac: {
    table: "lteCells",
    buildCondition: (value, refs) => buildInArray(refs.lteCells.tac, parseInt32s)(value),
  },
  lte_pci: {
    table: "lteCells",
    buildCondition: (value, refs) => buildInArray(refs.lteCells.pci, parseInt32s)(value),
  },
  earfcn: {
    table: "lteCells",
    buildCondition: (value, refs) => buildInArray(refs.lteCells.earfcn, parseInt32s)(value),
  },
  supports_iot: {
    table: "lteCells",
    buildCondition: (value, refs) => buildBooleanEq(refs.lteCells.supports_iot)(value),
  },

  // nrCells
  gnbid: {
    table: "nrCells",
    buildCondition: (value, refs) => buildInArray(refs.nrCells.gnbid, parseInt32s)(value),
  },
  nci: {
    table: "nrCells",
    buildCondition: (value, refs) => buildInArray(refs.nrCells.nci, parseNumbers)(value),
  },
  nr_clid: {
    table: "nrCells",
    buildCondition: (value, refs) => buildInArray(refs.nrCells.clid, parseInt32s)(value),
  },
  nrtac: {
    table: "nrCells",
    buildCondition: (value, refs) => buildInArray(refs.nrCells.nrtac, parseInt32s)(value),
  },
  nr_pci: {
    table: "nrCells",
    buildCondition: (value, refs) => buildInArray(refs.nrCells.pci, parseInt32s)(value),
  },
  arfcn: {
    table: "nrCells",
    buildCondition: (value, refs) => buildInArray(refs.nrCells.arfcn, parseInt32s)(value),
  },
  supports_nr_redcap: {
    table: "nrCells",
    buildCondition: (value, refs) => buildBooleanEq(refs.nrCells.supports_nr_redcap)(value),
  },

  // gps
  gps: {
    table: "locations",
    buildCondition: (value, refs) => {
      const [lat, lng] = parseCoordinates(value);
      return sql`ST_DWithin(${refs.locations.point}::geography, ST_MakePoint(${lng}, ${lat})::geography, 1000)`;
    },
  },

  // locations
  region: {
    table: "locations",
    buildCondition: (value, refs) =>
      buildInArrayFromStringSubquery(
        refs.locations.region_id,
        (values) =>
          sql`(SELECT id FROM ${refs.regions} WHERE country_code = ${LEGACY_COUNTRY_CODE} AND upper(code) IN (${sql.join(
            values.map((v) => sql`${v.toUpperCase()}`),
            sql`, `,
          )}))`,
      )(value),
  },
  city: {
    table: "locations",
    buildCondition: (value, refs) => {
      const values = parseStrings(value);
      const conditions = values.map((val) => sql`(${val} <% ${refs.locations.city} OR ${refs.locations.city} ILIKE ${`%${val}%`})`);
      return (conditions.length === 1 ? conditions[0] : or(...conditions)) as SQL;
    },
  },
  address: {
    table: "locations",
    buildCondition: (value, refs) => {
      const values = parseStrings(value);
      const conditions = values.map((val) => sql`(${val} <% ${refs.locations.address} OR ${refs.locations.address} ILIKE ${`%${val}%`})`);
      return (conditions.length === 1 ? conditions[0] : or(...conditions)) as SQL;
    },
  },

  // extraIdentificators
  networks_id: {
    table: "extraIdentificators",
    buildCondition: (value, refs) => {
      const values = parseStrings(value);
      const conditions = values.map((val) => sql`CAST(${refs.extraIdentificators.networks_id} AS TEXT) ILIKE ${`%${val}%`}`);
      return (conditions.length === 1 ? conditions[0] : or(...conditions)) as SQL;
    },
  },
  networks_name: {
    table: "extraIdentificators",
    buildCondition: (value, refs) => buildLikeAny(refs.extraIdentificators.networks_name)(value),
  },
  mno_name: {
    table: "extraIdentificators",
    buildCondition: (value, refs) => buildLikeAny(refs.extraIdentificators.mno_name)(value),
  },
};

export type ParsedFilters = Record<string, FilterValue>;

export type GroupedFilters = {
  stations: SQL[];
  cells: SQL[];
  gsmCells: SQL[];
  umtsCells: SQL[];
  lteCells: SQL[];
  nrCells: SQL[];
  locations: SQL[];
  extraIdentificators: SQL[];
};

const filterRegex =
  /(\w+):\s*(?:'([^']*)'|"([^"]*)"|(true|false)|(\d{4}-\d{2}-\d{2})|([+-]?\d+\.\d+,\s*[+-]?\d+\.\d+)|([\p{L}\p{N}]+(?:,\s*[\p{L}\p{N}]+)*)|(\d+(?:,\s*\d+)*))/giu;

type FilterMatch = {
  key: string;
  value: FilterValue;
  raw: string;
};

const parseFilterMatch = (match: RegExpMatchArray): FilterMatch | null => {
  const key = match[1]?.toLowerCase();
  if (!key) return null;

  const stringValue = match[2] ?? match[3];
  const booleanValue = match[4];
  const dateValue = match[5];
  const coordinateValue = match[6];
  const alphanumericValue = match[7];
  const numericValue = match[8];

  if (stringValue !== undefined) return { key, value: stringValue, raw: match[0] };
  if (booleanValue !== undefined) return { key, value: booleanValue === "true", raw: match[0] };
  if (dateValue !== undefined) return { key, value: dateValue, raw: match[0] };
  if (coordinateValue !== undefined) return { key, value: coordinateValue, raw: match[0] };
  if (numericValue !== undefined) return { key, value: numericValue, raw: match[0] };
  if (alphanumericValue !== undefined) return { key, value: alphanumericValue, raw: match[0] };

  return null;
};

export const createEmptyGroupedFilters = (): GroupedFilters => ({
  stations: [],
  cells: [],
  gsmCells: [],
  umtsCells: [],
  lteCells: [],
  nrCells: [],
  locations: [],
  extraIdentificators: [],
});

const implicitGpsRegex = /([+-]?\d+\.\d+)[,\s]+\s*([+-]?\d+\.\d+)/;

export function parseFilterQuery(query: string): { filters: ParsedFilters; remainingQuery: string } {
  const filters: ParsedFilters = {};
  let remainingQuery = query;

  for (const match of query.matchAll(filterRegex)) {
    const parsed = parseFilterMatch(match);
    if (!parsed) continue;
    if (!Object.hasOwn(FILTER_DEFINITIONS, parsed.key)) continue;

    filters[parsed.key] = parsed.value;
    remainingQuery = remainingQuery.replace(parsed.raw, "").trim();
  }

  if (!filters.gps) {
    const gpsMatch = remainingQuery.match(implicitGpsRegex);
    if (gpsMatch) {
      const lat = Number.parseFloat(gpsMatch[1]!);
      const lng = Number.parseFloat(gpsMatch[2]!);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        filters.gps = `${lat},${lng}`;
        remainingQuery = remainingQuery.replace(gpsMatch[0], "").trim();
      }
    }
  }

  return { filters, remainingQuery };
}

export function groupFiltersByTable(filters: ParsedFilters, refs: SearchFilterRefs = defaultFilterRefs): GroupedFilters {
  const grouped = createEmptyGroupedFilters();

  for (const [key, value] of Object.entries(filters)) {
    const definition = FILTER_DEFINITIONS[key];
    if (!definition) continue;

    try {
      grouped[definition.table].push(definition.buildCondition(value, refs));
    } catch (error) {
      throw new ErrorResponse("INVALID_QUERY", { message: `Invalid value for the search keyword "${key}"`, cause: error });
    }
  }
  return grouped;
}

export function buildRatAndBandKeywordMatch(rat: FilterValue | undefined, band: FilterValue | undefined): SQL | undefined {
  const filters: ParsedFilters = {};
  if (rat !== undefined) filters.rat = rat;
  if (band !== undefined) filters.band = band;

  return and(...groupFiltersByTable(filters).cells);
}

export function hasFilters(filters: ParsedFilters): boolean {
  return Object.keys(filters).length > 0;
}

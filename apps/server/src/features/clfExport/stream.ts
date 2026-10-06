// oxlint-disable no-await-in-loop
import { bands, cells, lteCells, nrCells, operators, stations } from "@openbts/drizzle";
import { type CLFDescriptionTemplates, CLF_DESCRIPTION_TEMPLATE_RATS } from "@openbts/shared/clfExportTemplates";
import { CELL_EXPORT_TEMPLATE_PARAMS, CELL_RATS, type CellExportQuery, type CellRat } from "@openbts/shared/contract";
import { type SQL, and, asc, eq, gt, gte, inArray, isNotNull, max, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { flagCondition } from "../../lib/conditions.js";
import { bandCondition, splitBandFilter } from "../bands/unknown.js";
import { operatedBy } from "../operators/sharing.js";
import { stationAreaConditions } from "../stations/read.js";
import type { ClfFormat, ConvertOptions } from "./converter.js";
import { type ExportSelection, loadExportLines } from "./lines.js";

export type CellExport = {
  stationConditions: SQL[];
  cells: Omit<ExportSelection, "stationConditions">;
  convertOptions: ConvertOptions;
};

const STATION_BATCH_SIZE = 500;
const LINES_PER_CHUNK = 200;

function toConvertOptions(query: CellExportQuery): ConvertOptions {
  const templates: CLFDescriptionTemplates = {};
  for (const rat of CLF_DESCRIPTION_TEMPLATE_RATS) {
    const template = query[CELL_EXPORT_TEMPLATE_PARAMS[rat]];
    if (template !== undefined) templates[rat] = template;
  }
  return { templates, displayNRSeparately: query.format === "ntm" && query.displayNrSeparately === true };
}

function iotConditions(column: typeof lteCells.supports_iot | typeof nrCells.supports_nr_redcap, supportsIot: boolean | undefined): SQL[] {
  if (supportsIot === undefined) return [];
  return [flagCondition(column, supportsIot)];
}

export function buildCellExport(query: CellExportQuery, hiddenCountryCodes: readonly string[]): CellExport {
  const stationConditions: SQL[] = [
    eq(stations.status, "published"),
    isNotNull(operators.mnc),
    ...stationAreaConditions({ countryCodes: query.countryCodes, regionIds: query.regionIds }, hiddenCountryCodes),
  ];
  if (query.operatorIds) stationConditions.push(operatedBy(stations.operator_id, query.operatorIds));

  const cellConditions: SQL[] = [];
  const bandMatch = bandCondition(cells.band_id, splitBandFilter(query.bandIds));
  if (bandMatch) cellConditions.push(bandMatch);
  if (query.updatedAfter) cellConditions.push(gte(cells.updatedAt, new Date(query.updatedAfter)));

  const isIotOnly = query.supportsIot === true;
  const includeIot = query.includeIot === true && query.supportsIot !== false;
  const isAsked = (rat: CellRat) => !query.rats || query.rats.includes(rat);
  const isLteAsked = isAsked("lte");
  const isNrAsked = isAsked("nr");
  return {
    stationConditions,
    cells: {
      cellConditions,
      lteConditions: iotConditions(lteCells.supports_iot, includeIot && !isLteAsked ? true : query.supportsIot),
      nrConditions: iotConditions(nrCells.supports_nr_redcap, includeIot && !isNrAsked ? true : query.supportsIot),
      rats: {
        gsm: isAsked("gsm") && !isIotOnly,
        umts: isAsked("umts") && !isIotOnly,
        lte: isLteAsked || includeIot,
        nr: isNrAsked || includeIot,
      },
    },
    convertOptions: toConvertOptions(query),
  };
}

function inExportedRat({ lteConditions, nrConditions, rats }: CellExport["cells"]): SQL | undefined {
  return or(
    rats.gsm ? eq(cells.rat, "GSM") : undefined,
    rats.umts ? eq(cells.rat, "UMTS") : undefined,
    rats.lte ? and(eq(cells.rat, "LTE"), ...lteConditions) : undefined,
    rats.nr ? and(eq(cells.rat, "NR"), ...nrConditions) : undefined,
  );
}

function exportsNoRat({ rats }: CellExport["cells"]): boolean {
  return !CELL_RATS.some((rat) => rats[rat]);
}

export async function loadCellExportLastModified({ stationConditions, cells: selection }: CellExport): Promise<Date | null> {
  if (exportsNoRat(selection)) return null;

  const [row] = await db
    .select({ lastModified: max(cells.updatedAt) })
    .from(cells)
    .innerJoin(stations, eq(cells.station_id, stations.id))
    .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
    .leftJoin(operators, eq(stations.operator_id, operators.id))
    .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
    .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
    .where(and(...stationConditions, ...selection.cellConditions, inExportedRat(selection)));
  return row?.lastModified ? new Date(row.lastModified) : null;
}

function hasExportedCells(selection: CellExport["cells"]): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${cells}
    LEFT JOIN ${lteCells} ON ${lteCells.cell_id} = ${cells.id}
    LEFT JOIN ${nrCells} ON ${nrCells.cell_id} = ${cells.id}
    WHERE ${and(eq(cells.station_id, stations.id), ...selection.cellConditions, inExportedRat(selection))}
  )`;
}

async function nextStationIds(stationFilter: SQL | undefined, afterId: number): Promise<number[]> {
  const rows = await db
    .select({ id: stations.id })
    .from(stations)
    .leftJoin(operators, eq(stations.operator_id, operators.id))
    .where(and(stationFilter, gt(stations.id, afterId)))
    .orderBy(asc(stations.id))
    .limit(STATION_BATCH_SIZE);
  return rows.map((row) => row.id);
}

export async function* readCellExportChunks(cellExport: CellExport, format: ClfFormat, stopped: AbortSignal): AsyncGenerator<string> {
  if (exportsNoRat(cellExport.cells)) return;

  const stationFilter = and(...cellExport.stationConditions, hasExportedCells(cellExport.cells));
  let lastStationId = 0;
  let stationIds = await nextStationIds(stationFilter, lastStationId);

  while (stationIds.length > 0 && !stopped.aborted) {
    const selection = { ...cellExport.cells, stationConditions: [inArray(stations.id, stationIds)] };
    const lines = (await loadExportLines(selection, format, cellExport.convertOptions)).sort();
    for (let start = 0; start < lines.length; start += LINES_PER_CHUNK) {
      yield `${lines.slice(start, start + LINES_PER_CHUNK).join("\n")}\n`;
    }

    lastStationId = stationIds.at(-1) ?? lastStationId;
    stationIds = await nextStationIds(stationFilter, lastStationId);
  }
}

export async function* stopWhenUnread(chunks: AsyncGenerator<string>, reader: AbortController, timeoutMs: number): AsyncGenerator<string> {
  for await (const chunk of chunks) {
    const unread = setTimeout(() => reader.abort(), timeoutMs);
    try {
      yield chunk;
    } finally {
      clearTimeout(unread);
    }
  }
}

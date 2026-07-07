import { locations, operators, regions, stations } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { createHash } from "node:crypto";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import redis from "../../../../database/redis.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { recordAnalyzerUsage } from "../../../../services/analyzerUsage.service.ts";
import {
  type AnalyzerResult,
  type CellGroups,
  type CellInput,
  type LookupMaps,
  addPair,
  candidateLTEEnbids,
  groupCellsByMnc,
  lteEnbidKey,
  pairKey,
} from "./logic.js";
import { analyzerPool } from "./pool.js";

const MAX_CELLS = 20_000;
const BATCH_SIZE = 200;
const LOOKUP_CONCURRENCY = 4;
const CACHE_TTL_S = 5 * 60;

const dateTime = z.iso.datetime({ offset: true });

const stationSchema = createSelectSchema(stations)
  .omit({ operator_id: true, location_id: true, status: true })
  .extend({ updatedAt: dateTime, createdAt: dateTime, statusChangedAt: dateTime });
const locationSchema = createSelectSchema(locations).omit({ point: true, region_id: true }).extend({ updatedAt: dateTime, createdAt: dateTime });
const regionSchema = createSelectSchema(regions);
const operatorSchema = createSelectSchema(operators);

const analyzerStationSchema = stationSchema.extend({
  operator: operatorSchema,
  location: locationSchema.extend({ region: regionSchema }),
});
type AnalyzerStation = z.infer<typeof analyzerStationSchema>;

const cellInputSchema = z.union([
  z.object({ rat: z.literal("GSM"), mnc: z.number().int(), lac: z.number().int(), cid: z.number().int() }),
  z.object({
    rat: z.literal("UMTS"),
    mnc: z.number().int(),
    lac: z.number().int(),
    cid: z.number().int(),
    rnc: z.number().int().nullable(),
    uarfcn: z.number().int().optional(),
  }),
  z.object({
    rat: z.literal("LTE"),
    mnc: z.number().int(),
    tac: z.number().int(),
    enbid: z.number().int(),
    clid: z.number().int(),
    pci: z.number().int(),
    earfcn: z.number().int().optional(),
  }),
  z.object({ rat: z.literal("NR"), mnc: z.number().int() }),
]);

const matchedCellSchema = z.union([
  z.object({
    rat: z.literal("GSM"),
    cell_id: z.number(),
    sector_id: z.number().nullable(),
    band_id: z.number().nullable(),
    notes: z.string().nullable().optional(),
    lac: z.number(),
    cid: z.number(),
    is_confirmed: z.boolean().nullable(),
  }),
  z.object({
    rat: z.literal("UMTS"),
    cell_id: z.number(),
    sector_id: z.number().nullable(),
    band_id: z.number().nullable(),
    notes: z.string().nullable().optional(),
    rnc: z.number(),
    cid: z.number(),
    lac: z.number().nullable(),
    arfcn: z.number().nullable(),
    is_confirmed: z.boolean(),
  }),
  z.object({
    rat: z.literal("LTE"),
    cell_id: z.number(),
    sector_id: z.number().nullable(),
    band_id: z.number().nullable(),
    notes: z.string().nullable().optional(),
    enbid: z.number(),
    clid: z.number().nullable(),
    tac: z.number().nullable(),
    pci: z.number().nullable(),
    earfcn: z.number().nullable(),
    is_confirmed: z.boolean(),
  }),
  z.object({ rat: z.literal("NR") }),
]);

type ReqBody = { Body: { cells: CellInput[] } };

const schemaRoute = {
  body: z.object({ cells: z.array(cellInputSchema).min(1).max(MAX_CELLS) }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          status: z.enum(["found", "probable", "not_found", "unsupported"]),
          station: analyzerStationSchema.optional(),
          cell: matchedCellSchema.optional(),
          warnings: z.array(z.string()),
        }),
      ),
    }),
  },
};

const STATION_WITH = {
  operator: true,
  location: { columns: { point: false, region_id: false }, with: { region: true } },
} as const;

const STATION_COLS = { operator_id: false, location_id: false, status: false } as const;
const CELL_COLS = { station_id: false } as const;

type LookupTask = () => Promise<void>;

function chunks<T>(items: Iterable<T>): T[][] {
  const values = [...items];
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += BATCH_SIZE) result.push(values.slice(i, i + BATCH_SIZE));
  return result;
}

function addLookupTasks<TGroup, TItem>(
  groups: ReadonlyMap<number, TGroup>,
  tasks: LookupTask[],
  getItems: (group: TGroup) => Iterable<TItem>,
  runLookup: (mnc: number, chunk: TItem[]) => Promise<void>,
): void {
  for (const [mnc, group] of groups) {
    for (const chunk of chunks(getItems(group))) {
      tasks.push(() => runLookup(mnc, chunk));
    }
  }
}

async function runLookupTasks(tasks: LookupTask[]): Promise<void> {
  let nextTaskIndex = 0;

  async function runNext(): Promise<void> {
    const task = tasks[nextTaskIndex];
    nextTaskIndex += 1;
    if (task === undefined) return;
    await task();
    return runNext();
  }

  await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, tasks.length) }, runNext));
}

function getMissingUMTSLACGroups(inputCells: CellInput[], umtsRNCMap: LookupMaps<AnalyzerStation>["umtsRncMap"]): CellGroups["umtsLacByMnc"] {
  const groups: CellGroups["umtsLacByMnc"] = new Map();
  for (const cell of inputCells) {
    if (cell.rat !== "UMTS") continue;
    const hasPrimary = cell.rnc !== null && umtsRNCMap.has(pairKey(cell.mnc, cell.rnc, cell.cid));
    if (!hasPrimary) addPair(groups, cell.mnc, cell.lac, cell.cid);
  }
  return groups;
}

function getMissingLTEENBIDGroups(inputCells: CellInput[], lteMap: LookupMaps<AnalyzerStation>["lteMap"]): CellGroups["lteEnbidsByMnc"] {
  const groups: CellGroups["lteEnbidsByMnc"] = new Map();
  for (const cell of inputCells) {
    if (cell.rat !== "LTE" || lteMap.has(pairKey(cell.mnc, cell.enbid, cell.clid))) continue;
    let enbids = groups.get(cell.mnc);
    if (!enbids) {
      enbids = new Set();
      groups.set(cell.mnc, enbids);
    }
    for (const enbid of candidateLTEEnbids(cell.mnc, cell.enbid)) enbids.add(enbid);
  }
  return groups;
}

async function executeLookups(inputCells: CellInput[], groups: CellGroups): Promise<LookupMaps<AnalyzerStation>> {
  const maps: LookupMaps<AnalyzerStation> = {
    gsmMap: new Map(),
    umtsRncMap: new Map(),
    umtsLacMap: new Map(),
    lteMap: new Map(),
    lteEnbidMap: new Map(),
  };

  const primaryTasks: LookupTask[] = [];
  const fallbackTasks: LookupTask[] = [];

  addLookupTasks(
    groups.gsmByMnc,
    primaryTasks,
    (pairMap) => pairMap.values(),
    async (mnc, chunk) => {
      const rows = await db.query.gsmCells.findMany({
        where: { cell: { station: { operator: { mnc }, status: "published" } }, OR: chunk.map(([lac, cid]) => ({ lac, cid })) },
        with: { cell: { columns: CELL_COLS, with: { station: { columns: STATION_COLS, with: STATION_WITH } } } },
      });

      for (const row of rows)
        maps.gsmMap.set(pairKey(mnc, row.lac, row.cid), {
          station: row.cell.station as unknown as AnalyzerStation,
          cell_id: row.cell_id,
          sector_id: row.cell.sector_id,
          band_id: row.cell.band_id,
          notes: row.cell.notes ?? null,
          lac: row.lac,
          cid: row.cid,
          is_confirmed: row.cell.is_confirmed,
        });
    },
  );

  addLookupTasks(
    groups.umtsRncByMnc,
    primaryTasks,
    (pairMap) => pairMap.values(),
    async (mnc, chunk) => {
      const rows = await db.query.umtsCells.findMany({
        where: { cell: { station: { operator: { mnc }, status: "published" } }, OR: chunk.map(([rnc, cid]) => ({ rnc, cid })) },
        with: { cell: { columns: CELL_COLS, with: { station: { columns: STATION_COLS, with: STATION_WITH } } } },
      });

      for (const row of rows)
        maps.umtsRncMap.set(pairKey(mnc, row.rnc, row.cid), {
          station: row.cell.station as unknown as AnalyzerStation,
          cell_id: row.cell_id,
          sector_id: row.cell.sector_id,
          band_id: row.cell.band_id,
          notes: row.cell.notes ?? null,
          rnc: row.rnc,
          cid: row.cid,
          lac: row.lac ?? null,
          arfcn: row.arfcn ?? null,
          is_confirmed: row.cell.is_confirmed,
        });
    },
  );

  addLookupTasks(
    groups.lteByMnc,
    primaryTasks,
    (pairMap) => pairMap.values(),
    async (mnc, chunk) => {
      const rows = await db.query.lteCells.findMany({
        where: { cell: { station: { operator: { mnc }, status: "published" } }, OR: chunk.map(([enbid, clid]) => ({ enbid, clid })) },
        with: { cell: { columns: CELL_COLS, with: { station: { columns: STATION_COLS, with: STATION_WITH } } } },
      });

      for (const row of rows)
        maps.lteMap.set(pairKey(mnc, row.enbid, row.clid), {
          station: row.cell.station as unknown as AnalyzerStation,
          cell_id: row.cell_id,
          sector_id: row.cell.sector_id,
          band_id: row.cell.band_id,
          notes: row.cell.notes ?? null,
          enbid: row.enbid,
          clid: row.clid,
          tac: row.tac ?? null,
          pci: row.pci ?? null,
          earfcn: row.earfcn ?? null,
          is_confirmed: row.cell.is_confirmed,
        });
    },
  );

  await runLookupTasks(primaryTasks);

  const missingUMTSLACGroups = getMissingUMTSLACGroups(inputCells, maps.umtsRncMap);
  const missingLTEENBIDGroups = getMissingLTEENBIDGroups(inputCells, maps.lteMap);

  addLookupTasks(
    missingUMTSLACGroups,
    fallbackTasks,
    (pairMap) => pairMap.values(),
    async (mnc, chunk) => {
      const rows = await db.query.umtsCells.findMany({
        where: { cell: { station: { operator: { mnc }, status: "published" } }, OR: chunk.map(([lac, cid]) => ({ lac, cid })) },
        with: { cell: { columns: CELL_COLS, with: { station: { columns: STATION_COLS, with: STATION_WITH } } } },
      });

      for (const row of rows) {
        if (row.lac === null) continue;
        maps.umtsLacMap.set(pairKey(mnc, row.lac, row.cid), {
          station: row.cell.station as unknown as AnalyzerStation,
          cell_id: row.cell_id,
          sector_id: row.cell.sector_id,
          band_id: row.cell.band_id,
          notes: row.cell.notes ?? null,
          rnc: row.rnc,
          cid: row.cid,
          lac: row.lac,
          arfcn: row.arfcn ?? null,
          is_confirmed: row.cell.is_confirmed,
        });
      }
    },
  );

  addLookupTasks(
    missingLTEENBIDGroups,
    fallbackTasks,
    (enbidSet) => enbidSet,
    async (mnc, chunk) => {
      const rows = await db.query.lteCells.findMany({
        where: { cell: { station: { operator: { mnc }, status: "published" } }, OR: chunk.map((enbid) => ({ enbid })) },
        with: { cell: { columns: CELL_COLS, with: { station: { columns: STATION_COLS, with: STATION_WITH } } } },
      });

      for (const row of rows) {
        const key = lteEnbidKey(mnc, row.enbid);
        if (maps.lteEnbidMap.has(key)) continue;
        maps.lteEnbidMap.set(key, {
          station: row.cell.station as unknown as AnalyzerStation,
          cell_id: row.cell_id,
          sector_id: row.cell.sector_id,
          band_id: row.cell.band_id,
          notes: row.cell.notes ?? null,
          enbid: row.enbid,
          is_confirmed: row.cell.is_confirmed,
        });
      }
    },
  );

  await runLookupTasks(fallbackTasks);
  return maps;
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<AnalyzerResult<AnalyzerStation>[]>>) {
  const { cells: inputCells } = req.body;

  void recordAnalyzerUsage();

  const key = `analyzer:${createHash("sha256").update(JSON.stringify(inputCells)).digest("hex")}`;
  const cached = await redis.get(key);
  if (cached) return res.send({ data: JSON.parse(cached) });

  const groups = groupCellsByMnc(inputCells);
  const maps = await executeLookups(inputCells, groups);

  const json = await analyzerPool.run(inputCells, maps);
  await redis.set(key, json, { EX: CACHE_TTL_S });

  return res.send({ data: JSON.parse(json) });
}

const analyzerRoute: Route<ReqBody, AnalyzerResult<AnalyzerStation>[]> = {
  url: "/analyzer",
  method: "POST",
  schema: schemaRoute,
  handler,
};

export default analyzerRoute;

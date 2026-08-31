import { bands, locations, operators, regions, stations, ukeLocations, ukePermits, ukeStations } from "@openbts/drizzle";
import { and, eq, inArray, sql } from "drizzle-orm";
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
  NETWORKS_SIBLING_MNC,
  addPair,
  candidateLTEEnbids,
  groupCellsByMnc,
  lteEnbidKey,
  pairKey,
  stripFirstDigit,
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

const bandSchema = createSelectSchema(bands);
const ukeMatchPermitSchema = createSelectSchema(ukePermits)
  .omit({ uke_station_id: true, band_id: true })
  .extend({ updatedAt: dateTime, createdAt: dateTime, expiry_date: dateTime, band: bandSchema.nullable() });
const ukeMatchLocationSchema = createSelectSchema(ukeLocations)
  .omit({ point: true, region_id: true })
  .extend({ updatedAt: dateTime, createdAt: dateTime, region: regionSchema });
const ukeMatchStationSchema = createSelectSchema(ukeStations)
  .omit({ operator_id: true, location_id: true })
  .extend({
    updatedAt: dateTime,
    createdAt: dateTime,
    operator: operatorSchema,
    location: ukeMatchLocationSchema,
    permits: z.array(ukeMatchPermitSchema),
  });
type UkeMatchStation = z.infer<typeof ukeMatchStationSchema>;
type EnrichedAnalyzerResult = AnalyzerResult<AnalyzerStation> & { uke_stations?: UkeMatchStation[] };

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
          uke_stations: z.array(ukeMatchStationSchema).optional(),
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

function lteLookupMncs(mnc: number): number[] {
  const sibling = NETWORKS_SIBLING_MNC.get(mnc);
  return sibling === undefined ? [mnc] : [mnc, sibling];
}

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
        where: {
          cell: { station: { operator: { mnc: { in: lteLookupMncs(mnc) } }, status: "published" } },
          OR: chunk.map(([enbid, clid]) => ({ enbid, clid })),
        },
        with: { cell: { columns: CELL_COLS, with: { station: { columns: STATION_COLS, with: STATION_WITH } } } },
      });

      for (const row of rows) {
        const key = pairKey(mnc, row.enbid, row.clid);
        const sibling = (row.cell.station.operator?.mnc ?? null) !== mnc;
        const existing = maps.lteMap.get(key);
        if (existing && (!existing.sibling || sibling)) continue;
        maps.lteMap.set(key, {
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
          sibling,
          is_confirmed: row.cell.is_confirmed,
        });
      }
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
        where: {
          cell: { station: { operator: { mnc: { in: lteLookupMncs(mnc) } }, status: "published" } },
          OR: chunk.map((enbid) => ({ enbid })),
        },
        with: { cell: { columns: CELL_COLS, with: { station: { columns: STATION_COLS, with: STATION_WITH } } } },
      });

      for (const row of rows) {
        const key = lteEnbidKey(mnc, row.enbid);
        const sibling = (row.cell.station.operator?.mnc ?? null) !== mnc;
        const existing = maps.lteEnbidMap.get(key);
        if (existing && (!existing.sibling || sibling)) continue;
        maps.lteEnbidMap.set(key, {
          station: row.cell.station as unknown as AnalyzerStation,
          cell_id: row.cell_id,
          sector_id: row.cell.sector_id,
          band_id: row.cell.band_id,
          notes: row.cell.notes ?? null,
          enbid: row.enbid,
          sibling,
          is_confirmed: row.cell.is_confirmed,
        });
      }
    },
  );

  await runLookupTasks(fallbackTasks);
  return maps;
}

const UKE_MATCH_MNCS = new Set([26001, 26002, 26003]);
const MAX_UKE_STATIONS_PER_CELL = 5;

function ukeFragmentCandidates(mnc: number, enbid: number): string[] {
  const stripped = stripFirstDigit(enbid);
  const ordered = mnc === 26001 ? [enbid, stripped] : [stripped, enbid];
  return [...new Set(ordered.filter((value): value is number => value !== null).map(String))];
}

function iso(date: Date): string {
  return date.toISOString();
}

async function attachUkeMatches(inputCells: CellInput[], results: EnrichedAnalyzerResult[]): Promise<boolean> {
  const fragmentsByMnc = new Map<number, Set<string>>();
  const pending: { index: number; mncs: number[]; fragments: string[] }[] = [];

  for (let i = 0; i < inputCells.length; i++) {
    const cell = inputCells[i];
    if (!cell || cell.rat !== "LTE" || !UKE_MATCH_MNCS.has(cell.mnc) || results[i]?.status !== "not_found") continue;
    const fragments = ukeFragmentCandidates(cell.mnc, cell.enbid);
    if (fragments.length === 0) continue;
    const mncs = lteLookupMncs(cell.mnc);
    for (const mnc of mncs) {
      let mncFragments = fragmentsByMnc.get(mnc);
      if (!mncFragments) {
        mncFragments = new Set();
        fragmentsByMnc.set(mnc, mncFragments);
      }
      for (const fragment of fragments) mncFragments.add(fragment);
    }
    pending.push({ index: i, mncs, fragments });
  }
  if (pending.length === 0) return false;

  const fragmentExpr = sql<string>`split_part(${ukePermits.decision_number}, '/', 3)`;
  const permitRows = await db
    .select({ permit: ukePermits, band: bands, station_id: ukeStations.id, mnc: operators.mnc, fragment: fragmentExpr })
    .from(ukePermits)
    .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
    .innerJoin(operators, eq(ukeStations.operator_id, operators.id))
    .leftJoin(bands, eq(ukePermits.band_id, bands.id))
    .where(
      and(
        inArray(fragmentExpr, [...new Set([...fragmentsByMnc.values()].flatMap((fragments) => [...fragments]))]),
        inArray(operators.mnc, [...fragmentsByMnc.keys()]),
      ),
    );
  if (permitRows.length === 0) return false;

  const stationIdsByKey = new Map<string, number[]>();
  const permitsByStation = new Map<number, UkeMatchStation["permits"]>();
  for (const row of permitRows) {
    if (row.mnc === null || !fragmentsByMnc.get(row.mnc)?.has(row.fragment)) continue;
    const key = `${row.mnc}:${row.fragment}`;
    let stationIds = stationIdsByKey.get(key);
    if (!stationIds) {
      stationIds = [];
      stationIdsByKey.set(key, stationIds);
    }
    if (!stationIds.includes(row.station_id)) stationIds.push(row.station_id);

    let permits = permitsByStation.get(row.station_id);
    if (!permits) {
      permits = [];
      permitsByStation.set(row.station_id, permits);
    }
    const { uke_station_id: _ukeStationId, band_id: _bandId, ...permit } = row.permit;
    permits.push({
      ...permit,
      expiry_date: iso(permit.expiry_date),
      createdAt: iso(permit.createdAt),
      updatedAt: iso(permit.updatedAt),
      band: row.band,
    });
  }
  if (permitsByStation.size === 0) return false;

  const stationRows = await db.query.ukeStations.findMany({
    columns: { operator_id: false, location_id: false },
    with: { operator: true, location: { columns: { point: false, region_id: false }, with: { region: true } } },
    where: { id: { in: [...permitsByStation.keys()] } },
  });

  const stationsById = new Map<number, UkeMatchStation>();
  for (const station of stationRows) {
    stationsById.set(station.id, {
      ...station,
      createdAt: iso(station.createdAt),
      updatedAt: iso(station.updatedAt),
      location: { ...station.location, createdAt: iso(station.location.createdAt), updatedAt: iso(station.location.updatedAt) },
      permits: permitsByStation.get(station.id) ?? [],
    });
  }

  let attached = false;
  for (const { index, mncs, fragments } of pending) {
    const stationIds: number[] = [];
    for (const mnc of mncs) {
      for (const fragment of fragments) {
        for (const stationId of stationIdsByKey.get(`${mnc}:${fragment}`) ?? []) {
          if (!stationIds.includes(stationId)) stationIds.push(stationId);
        }
      }
    }
    const matched = stationIds
      .slice(0, MAX_UKE_STATIONS_PER_CELL)
      .map((stationId) => stationsById.get(stationId))
      .filter((station): station is UkeMatchStation => station !== undefined);
    const result = results[index];
    if (result && matched.length > 0) {
      result.uke_stations = matched;
      result.warnings.push("uke_match");
      const [ownMnc] = mncs;
      if (mncs.length > 1 && !matched.some((station) => station.operator.mnc === ownMnc)) result.warnings.push("ran_sharing");
      attached = true;
    }
  }
  return attached;
}

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<EnrichedAnalyzerResult[]>>) {
  const { cells: inputCells } = req.body;

  void recordAnalyzerUsage();

  const key = `analyzer:${createHash("sha256").update(JSON.stringify(inputCells)).digest("hex")}`;
  const cached = await redis.get(key);
  if (cached) return res.send({ data: JSON.parse(cached) });

  const groups = groupCellsByMnc(inputCells);
  const maps = await executeLookups(inputCells, groups);

  const json = await analyzerPool.run(inputCells, maps);
  const results: EnrichedAnalyzerResult[] = JSON.parse(json);
  const hasUkeMatches = await attachUkeMatches(inputCells, results);
  await redis.set(key, hasUkeMatches ? JSON.stringify(results) : json, { EX: CACHE_TTL_S });

  return res.send({ data: results });
}

const analyzerRoute: Route<ReqBody, EnrichedAnalyzerResult[]> = {
  url: "/analyzer",
  method: "POST",
  schema: schemaRoute,
  handler,
};

export default analyzerRoute;

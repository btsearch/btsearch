import {
  type BandVariant,
  type DuplexType,
  bands,
  cells,
  countryBands,
  gsmCells,
  locations,
  lteCells,
  nrCells,
  operators,
  type ratEnum,
  regions,
  stations,
  umtsCells,
} from "@openbts/drizzle";
import type { Database } from "@openbts/drizzle/db";
import { db } from "@openbts/drizzle/db";
/* eslint-disable no-await-in-loop */
import { eq, sql } from "drizzle-orm";

import { logger } from "../logger.js";
import type { PreparedBandKey, PreparedCell, PreparedLocation, PreparedOperator, PreparedRegion, PreparedStation } from "./transformers.js";

const LEGACY_COUNTRY_CODE = "PL";

export interface RegionIdMap extends Map<string, number> {}
export interface OperatorIdMap extends Map<number, number> {}
export interface LocationIdMap extends Map<number, number> {}
export interface StationIdMap extends Map<number, number> {}
export interface BandIdKey {
  rat: (typeof ratEnum.enumValues)[number];
  value: number;
  duplex: (typeof DuplexType.enumValues)[number] | null;
  variant?: (typeof BandVariant.enumValues)[number];
}
export interface BandIdMap extends Map<string, number> {}
export interface CellIdMap extends Map<number, number> {}

function bandKeyId(k: BandIdKey): string {
  return `${k.rat}:${k.value}:${k.duplex ?? ""}`;
}

interface WriteOptions {
  batchSize?: number;
  onProgress?: (processed: number) => void;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (!size || size <= 0 || size === Number.POSITIVE_INFINITY) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export { db };
export type { Database };

export async function pruneTables(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE ${nrCells}, ${lteCells}, ${umtsCells}, ${gsmCells}, ${cells}, ${stations}, ${locations} RESTART IDENTITY CASCADE`,
  );
}

export async function writeRegions(items: PreparedRegion[], options: WriteOptions = {}): Promise<RegionIdMap> {
  const unique = new Map<string, PreparedRegion>();
  for (const region of items) unique.set(region.name, region);
  const dedup = [...unique.values()];
  const batchSize = options.batchSize ?? dedup.length;
  if (dedup.length) {
    for (const group of chunkArray(dedup, batchSize)) {
      if (group.length === 0) continue;
      const values = group.map((r) => ({ name: r.name, code: r.code }));
      const inserted = await db
        .insert(regions)
        .values(values)
        .onConflictDoNothing({ target: [regions.countryCode, regions.name] })
        .returning({ name: regions.name });
      const insertedNames = new Set(inserted.map((r) => r.name));
      const skipped = group.filter((r) => !insertedNames.has(r.name));
      for (const r of skipped) {
        logger.warn(`[regions] conflict, skipped: name=${r.name}, code=${r.code}`);
      }
      options.onProgress?.(group.length);
    }
  }
  const names = dedup.map((region) => region.name);
  const rows = names.length ? await db.query.regions.findMany({ where: { name: { in: names } } }) : [];
  const map: RegionIdMap = new Map();
  for (const row of rows) map.set(row.name, row.id);
  return map;
}

export async function writeOperators(items: PreparedOperator[], options: WriteOptions = {}): Promise<OperatorIdMap> {
  const unique = new Map<number, PreparedOperator>();
  for (const operator of items) unique.set(operator.mnc, operator);
  const dedup = [...unique.values()];
  const batchSize = options.batchSize ?? dedup.length;
  if (dedup.length) {
    for (const group of chunkArray(dedup, batchSize)) {
      if (group.length === 0) continue;
      const values = group.map((o) => ({ name: o.name, full_name: o.full_name, mnc: o.mnc }));
      const inserted = await db
        .insert(operators)
        .values(values)
        .onConflictDoNothing({ target: [operators.mnc] })
        .returning({ mnc: operators.mnc });
      const insertedMncs = new Set(inserted.map((r) => r.mnc));
      const skipped = group.filter((o) => !insertedMncs.has(o.mnc));
      for (const o of skipped) {
        logger.warn(`[operators] conflict, skipped: name=${o.name}, full_name=${o.full_name}, mnc=${o.mnc}`);
      }
      options.onProgress?.(group.length);
    }
  }
  const mncs = dedup.map((operator) => operator.mnc);
  const rows = mncs.length ? await db.query.operators.findMany({ where: { mnc: { in: mncs } } }) : [];
  const map: OperatorIdMap = new Map();
  for (const row of rows) map.set(row.mnc ?? 0, row.id);
  return map;
}

export async function updateOperatorParents(): Promise<void> {
  const relevant = ["NetWorks", "T-Mobile", "Orange", "Plus", "Aero 2", "Sferia"] as const;
  const rows = await db.query.operators.findMany({ where: { name: { in: relevant as unknown as string[] } } });
  const nameToId = new Map<string, number>();
  for (const operator of rows) nameToId.set(operator.name, operator.id);

  const parentOfNetworks = nameToId.get("NetWorks");
  const parentOfPlus = nameToId.get("Plus");

  const updates: { child: number; parent: number }[] = [];
  const tmobile = nameToId.get("T-Mobile");
  if (tmobile && parentOfNetworks) updates.push({ child: tmobile, parent: parentOfNetworks });
  const orange = nameToId.get("Orange");
  if (orange && parentOfNetworks) updates.push({ child: orange, parent: parentOfNetworks });
  const aero2 = nameToId.get("Aero 2");
  if (aero2 && parentOfPlus) updates.push({ child: aero2, parent: parentOfPlus });
  const sferia = nameToId.get("Sferia");
  if (sferia && parentOfPlus) updates.push({ child: sferia, parent: parentOfPlus });

  await Promise.all(updates.map((update) => db.update(operators).set({ parent_id: update.parent }).where(eq(operators.id, update.child))));
}

export async function writeLocations(items: PreparedLocation[], regionIds: RegionIdMap, options: WriteOptions = {}): Promise<LocationIdMap> {
  const withRegions = items
    .map((location) => ({ original: location, regionId: regionIds.get(location.region_name) }))
    .filter((item): item is { original: PreparedLocation; regionId: number } => typeof item.regionId === "number");

  const values = withRegions.map((item) => ({
    region_id: item.regionId,
    city: item.original.city ?? undefined,
    address: item.original.address ?? undefined,
    longitude: item.original.longitude,
    latitude: item.original.latitude,
    createdAt: item.original.date_added ?? undefined,
    updatedAt: item.original.date_updated ?? undefined,
  }));

  const batchSize = options.batchSize ?? values.length;
  const inserted: { id: number; longitude: number; latitude: number }[] = [];
  if (values.length) {
    for (const [groupIdx, group] of chunkArray(values, batchSize).entries()) {
      if (group.length === 0) continue;
      const groupWithRegions = chunkArray(withRegions, batchSize)[groupIdx] ?? [];
      const part = await db
        .insert(locations)
        .values(group)
        .onConflictDoNothing({ target: [locations.longitude, locations.latitude] })
        .returning({ id: locations.id, longitude: locations.longitude, latitude: locations.latitude });
      if (part.length < group.length) {
        const insertedCoords = new Set(part.map((r) => `${r.longitude}:${r.latitude}`));
        const skipped = groupWithRegions.filter((item) => !insertedCoords.has(`${item.original.longitude}:${item.original.latitude}`));
        for (const item of skipped) {
          logger.warn(
            `[locations] conflict, skipped: region=${item.original.region_name}, city=${item.original.city ?? "N/A"}, ` +
              `address=${item.original.address ?? "N/A"}, lon=${item.original.longitude}, lat=${item.original.latitude}`,
          );
        }
      }
      inserted.push(...part);
      options.onProgress?.(group.length);
    }
  }

  const coordToId = new Map<string, number>();
  for (const row of inserted) coordToId.set(`${row.longitude}:${row.latitude}`, row.id);

  const map: LocationIdMap = new Map();
  for (const item of withRegions) {
    const id = coordToId.get(`${item.original.longitude}:${item.original.latitude}`);
    if (typeof id === "number") map.set(item.original.original_id, id);
  }
  return map;
}

export async function writeStations(
  items: PreparedStation[],
  operatorIds: OperatorIdMap,
  locationIds: LocationIdMap,
  options: WriteOptions = {},
): Promise<StationIdMap> {
  const prepared = items.map((station) => ({
    station,
    operatorId: operatorIds.get(station.operator_mnc) ?? (null as number | null),
    locationId: locationIds.get(station.location_original_id) ?? (null as number | null),
  }));

  const values = prepared.map((p) => ({
    station_id: p.station.station_id,
    location_id: p.locationId,
    operator_id: p.operatorId,
    notes: p.station.notes ?? undefined,
    extra_address: p.station.extra_address ?? undefined,
    status: p.station.status,
    is_confirmed: p.station.is_confirmed,
    createdAt: p.station.date_added ?? undefined,
    updatedAt: p.station.date_updated ?? undefined,
  }));
  const batchSize = options.batchSize ?? values.length;
  if (values.length) {
    for (const [groupIdx, group] of chunkArray(values, batchSize).entries()) {
      if (group.length === 0) continue;
      const groupPrepared = chunkArray(prepared, batchSize)[groupIdx] ?? [];
      const inserted = await db
        .insert(stations)
        .values(group)
        .onConflictDoNothing({ target: [stations.station_id, stations.operator_id] })
        .returning({ station_id: stations.station_id, operator_id: stations.operator_id });
      if (inserted.length < group.length) {
        const insertedKeys = new Set(inserted.map((r) => `${r.station_id}:${r.operator_id}`));
        const skipped = groupPrepared.filter((p) => !insertedKeys.has(`${p.station.station_id}:${p.operatorId}`));
        for (const p of skipped) {
          logger.warn(
            `[stations] conflict, skipped: station_id=${p.station.station_id}, operator_mnc=${p.station.operator_mnc}, ` +
              `location_original_id=${p.station.location_original_id}, status=${p.station.status}, notes=${p.station.notes ?? "N/A"}`,
          );
        }
      }
      options.onProgress?.(group.length);
    }
  }
  const uniqueStationIds = Array.from(new Set(prepared.map((p) => p.station.station_id)));
  const rows = uniqueStationIds.length ? await db.query.stations.findMany({ where: { station_id: { in: uniqueStationIds } } }) : [];
  const pairToId = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.station_id}:${row.operator_id}`;
    if (!pairToId.has(key)) pairToId.set(key, row.id);
  }

  const map: StationIdMap = new Map();
  for (const p of prepared) {
    const key = `${p.station.station_id}:${p.operatorId}`;
    const id = pairToId.get(key);
    if (typeof id === "number") map.set(p.station.original_id, id);
  }
  return map;
}

export async function writeBands(keys: PreparedBandKey[], options: WriteOptions = {}): Promise<BandIdMap> {
  const normKeys: BandIdKey[] = keys.map((band) => ({
    rat: band.rat,
    value: band.value,
    duplex: band.duplex,
    name: `${band.rat.toUpperCase()} ${band.value}${band.duplex ? ` (${band.duplex})` : ""}`,
  }));
  const unique = new Map<string, BandIdKey>();
  for (const band of normKeys) unique.set(bandKeyId(band), band);
  const dedup = [...unique.values()];
  const batchSize = options.batchSize ?? dedup.length;
  if (dedup.length) {
    for (const group of chunkArray(dedup, batchSize)) {
      if (group.length === 0) continue;
      const values = group.map((band) => ({
        rat: band.rat,
        value: band.value,
        duplex: band.duplex,
        name: `${band.rat.toUpperCase()} ${band.value}${band.duplex ? ` (${band.duplex})` : ""}`,
        variant: "commercial" as const,
      }));
      const inserted = await db
        .insert(bands)
        .values(values)
        .onConflictDoNothing()
        .returning({ id: bands.id, rat: bands.rat, value: bands.value, duplex: bands.duplex });
      if (inserted.length > 0) await db.insert(countryBands).values(inserted.map((band) => ({ countryCode: LEGACY_COUNTRY_CODE, bandId: band.id })));
      if (inserted.length < group.length) {
        const insertedKeys = new Set(inserted.map((r) => bandKeyId({ rat: r.rat, value: r.value ?? 0, duplex: r.duplex })));
        const skipped = group.filter((b) => !insertedKeys.has(bandKeyId(b)));
        for (const b of skipped) {
          logger.warn(`[bands] conflict, skipped: rat=${b.rat}, value=${b.value}, duplex=${b.duplex ?? "N/A"}`);
        }
      }
      options.onProgress?.(group.length);
    }
  }
  const rows = dedup.length ? await db.query.bands.findMany() : [];
  const map: BandIdMap = new Map();
  for (const band of rows) {
    map.set(bandKeyId({ rat: band.rat, value: band.value ?? 0, duplex: band.duplex }), band.id);
  }

  return map;
}

export async function fetchRegionIds(): Promise<RegionIdMap> {
  const rows = await db.query.regions.findMany();
  const map: RegionIdMap = new Map();
  for (const row of rows) map.set(row.name, row.id);
  return map;
}

export async function fetchBandIds(): Promise<BandIdMap> {
  const rows = await db.query.bands.findMany({
    where: {
      variant: "commercial",
    },
  });
  const map: BandIdMap = new Map();
  for (const row of rows) {
    map.set(bandKeyId({ rat: row.rat, value: row.value ?? 0, duplex: row.duplex }), row.id);
  }
  return map;
}

export async function writeCellsAndDetails(
  items: PreparedCell[],
  stationIds: StationIdMap,
  bandIds: BandIdMap,
  options: WriteOptions = {},
): Promise<void> {
  const prepared = items
    .map((cell) => ({
      cell,
      stationId: stationIds.get(cell.station_original_id) ?? (null as number | null),
      bandId: bandIds.get(bandKeyId({ rat: cell.band_key.rat, value: cell.band_key.value, duplex: cell.band_key.duplex })) ?? (null as number | null),
    }))
    .filter((p) => typeof p.stationId === "number" && typeof p.bandId === "number");

  const batchSize = options.batchSize ?? 1000;

  const baseValues = prepared.map((p) => ({
    station_id: p.stationId as number,
    band_id: p.bandId as number,
    rat: p.cell.rat,
    notes: p.cell.notes ?? undefined,
    is_confirmed: p.cell.is_confirmed,
    createdAt: p.cell.date_added ?? undefined,
    updatedAt: p.cell.date_updated ?? undefined,
  }));

  const inserted: { id: number }[] = [];
  for (const group of chunkArray(baseValues, batchSize)) {
    if (group.length === 0) continue;
    const part = await db.insert(cells).values(group).returning({ id: cells.id });
    inserted.push(...part);
    options.onProgress?.(group.length);
  }

  const withIds = prepared.map((prep, i) => ({ id: inserted[i]?.id ?? 0, cell: prep.cell }));

  const gsmValues = withIds
    .filter((val): val is { id: number; cell: Extract<PreparedCell, { rat: "GSM" }> } => val.cell.rat === "GSM" && !!val.id)
    .filter((val) => val.cell.gsm.lac !== null && val.cell.gsm.lac !== undefined && val.cell.gsm.cid !== null && val.cell.gsm.cid !== undefined)
    .map((val) => ({
      cell_id: val.id,
      lac: val.cell.gsm.lac as number,
      cid: val.cell.gsm.cid as number,
      e_gsm: val.cell.gsm.e_gsm,
      createdAt: val.cell.date_added ?? new Date(),
      updatedAt: val.cell.date_updated ?? new Date(),
    }));
  for (const group of chunkArray(gsmValues, batchSize)) {
    if (group.length === 0) continue;
    const inserted = await db
      .insert(gsmCells)
      .values(group)
      .onConflictDoNothing({ target: [gsmCells.cell_id, gsmCells.lac, gsmCells.cid] })
      .returning({ cell_id: gsmCells.cell_id, lac: gsmCells.lac, cid: gsmCells.cid });
    if (inserted.length < group.length) {
      const insertedKeys = new Set(inserted.map((r) => `${r.cell_id}:${r.lac}:${r.cid}`));
      const skipped = group.filter((g) => !insertedKeys.has(`${g.cell_id}:${g.lac}:${g.cid}`));
      for (const g of skipped) {
        logger.warn(`[gsmCells] conflict, skipped: cell_id=${g.cell_id}, lac=${g.lac}, cid=${g.cid}, e_gsm=${g.e_gsm}`);
      }
    }
  }

  const umtsValues = withIds
    .filter((val): val is { id: number; cell: Extract<PreparedCell, { rat: "UMTS" }> } => val.cell.rat === "UMTS" && !!val.id)
    .map((val) => ({
      cell_id: val.id,
      lac: val.cell.umts.lac,
      rnc: val.cell.umts.rnc,
      cid: val.cell.umts.cid,
      arfcn: val.cell.umts.arfcn,
      createdAt: val.cell.date_added ?? new Date(),
      updatedAt: val.cell.date_updated ?? new Date(),
    }));
  for (const group of chunkArray(umtsValues, batchSize)) {
    if (group.length === 0) continue;
    const inserted = await db
      .insert(umtsCells)
      .values(group)
      .onConflictDoNothing({ target: [umtsCells.cell_id, umtsCells.rnc, umtsCells.cid] })
      .returning({ cell_id: umtsCells.cell_id, rnc: umtsCells.rnc, cid: umtsCells.cid });
    if (inserted.length < group.length) {
      const insertedKeys = new Set(inserted.map((r) => `${r.cell_id}:${r.rnc}:${r.cid}`));
      const skipped = group.filter((g) => !insertedKeys.has(`${g.cell_id}:${g.rnc}:${g.cid}`));
      for (const g of skipped) {
        logger.warn(`[umtsCells] conflict, skipped: cell_id=${g.cell_id}, lac=${g.lac}, rnc=${g.rnc}, cid=${g.cid}, arfcn=${g.arfcn}`);
      }
    }
  }

  const lteValues = withIds
    .filter((val): val is { id: number; cell: Extract<PreparedCell, { rat: "LTE" }> } => val.cell.rat === "LTE" && !!val.id)
    .map((val) => ({
      cell_id: val.id,
      tac: val.cell.lte.tac,
      enbid: val.cell.lte.enbid,
      clid: val.cell.lte.clid,
      pci: val.cell.lte.pci,
      arfcn: val.cell.lte.arfcn,
      supports_iot: val.cell.lte.supports_iot,
      createdAt: val.cell.date_added ?? new Date(),
      updatedAt: val.cell.date_updated ?? new Date(),
    }));
  for (const group of chunkArray(lteValues, batchSize)) {
    if (group.length === 0) continue;
    const inserted = await db
      .insert(lteCells)
      .values(group)
      .onConflictDoNothing({ target: [lteCells.cell_id, lteCells.enbid, lteCells.clid] })
      .returning({ cell_id: lteCells.cell_id, enbid: lteCells.enbid, clid: lteCells.clid });
    if (inserted.length < group.length) {
      const insertedKeys = new Set(inserted.map((r) => `${r.cell_id}:${r.enbid}:${r.clid}`));
      const skipped = group.filter((g) => !insertedKeys.has(`${g.cell_id}:${g.enbid}:${g.clid}`));
      for (const g of skipped) {
        logger.warn(`[lteCells] conflict, skipped: cell_id=${g.cell_id}, tac=${g.tac}, enbid=${g.enbid}, clid=${g.clid}, nb_iot=${g.supports_iot}`);
      }
    }
  }

  const nrValues = withIds
    .filter((val): val is { id: number; cell: Extract<PreparedCell, { rat: "NR" }> } => val.cell.rat === "NR" && !!val.id)
    .map((val) => ({
      cell_id: val.id,
      nrtac: val.cell.nr.nrtac,
      gnbid: val.cell.nr.gnbid,
      clid: val.cell.nr.clid,
      pci: val.cell.nr.pci,
      type: val.cell.nr.type,
      supports_nr_redcap: val.cell.nr.supports_nr_redcap,
      createdAt: val.cell.date_added ?? new Date(),
      updatedAt: val.cell.date_updated ?? new Date(),
    }));
  for (const group of chunkArray(nrValues, batchSize)) {
    if (group.length === 0) continue;
    const inserted = await db
      .insert(nrCells)
      .values(group)
      .onConflictDoNothing({ target: [nrCells.cell_id] })
      .returning({ cell_id: nrCells.cell_id });
    if (inserted.length < group.length) {
      const insertedKeys = new Set(inserted.map((r) => r.cell_id));
      const skipped = group.filter((g) => !insertedKeys.has(g.cell_id));
      for (const g of skipped) {
        logger.warn(
          `[nrCells] conflict, skipped: cell_id=${g.cell_id}, nrtac=${g.nrtac}, gnbid=${g.gnbid}, clid=${g.clid}, redcap=${g.supports_nr_redcap}`,
        );
      }
    }
  }
}

import { bands, operators, statsSnapshots, ukePermits } from "@openbts/drizzle";
import { and, count, countDistinct, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "../database/psql.js";
import { logger } from "../utils/logger.js";

export async function takeStatsSnapshot(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [bandRows, operatorRows] = await Promise.all([
    db
      .select({
        operator_id: ukePermits.operator_id,
        band_id: ukePermits.band_id,
        unique_stations_count: countDistinct(ukePermits.station_id),
        permits_count: count(),
      })
      .from(ukePermits)
      .groupBy(ukePermits.operator_id, ukePermits.band_id),
    db
      .select({
        operator_id: ukePermits.operator_id,
        unique_stations_count: countDistinct(ukePermits.station_id),
      })
      .from(ukePermits)
      .groupBy(ukePermits.operator_id),
  ]);

  if (bandRows.length === 0) {
    logger.info("Stats snapshot: no permit data found, skipping");
    return;
  }

  await db
    .insert(statsSnapshots)
    .values(
      bandRows.map((row) => ({
        snapshot_date: today,
        operator_id: row.operator_id,
        band_id: row.band_id,
        unique_stations_count: row.unique_stations_count,
        permits_count: row.permits_count,
      })),
    )
    .onConflictDoUpdate({
      target: [statsSnapshots.snapshot_date, statsSnapshots.operator_id, statsSnapshots.band_id],
      set: {
        unique_stations_count: sql`excluded.unique_stations_count`,
        permits_count: sql`excluded.permits_count`,
      },
    });

  // One summary row per operator (band_id = NULL) with the true deduplicated station count
  await db
    .insert(statsSnapshots)
    .values(
      operatorRows.map((row) => ({
        snapshot_date: today,
        operator_id: row.operator_id,
        band_id: null,
        unique_stations_count: row.unique_stations_count,
        permits_count: 0,
      })),
    )
    .onConflictDoUpdate({
      target: [statsSnapshots.snapshot_date, statsSnapshots.operator_id],
      targetWhere: sql`${statsSnapshots.band_id} IS NULL`,
      set: {
        unique_stations_count: sql`excluded.unique_stations_count`,
      },
    });

  logger.info(`Stats snapshot: saved ${bandRows.length} band rows + ${operatorRows.length} operator rows for ${today.toISOString().slice(0, 10)}`);
}

export interface SnapshotOperatorDelta {
  id: number;
  name: string;
  permitsDelta: number;
}

export interface SnapshotBandDelta {
  id: number;
  name: string;
  permitsDelta: number;
}

export interface SnapshotDelta {
  byOperator: SnapshotOperatorDelta[];
  byBand: SnapshotBandDelta[];
}

export async function getSnapshotDelta(): Promise<SnapshotDelta | null> {
  const dates = await db
    .selectDistinct({ snapshot_date: statsSnapshots.snapshot_date })
    .from(statsSnapshots)
    .orderBy(desc(statsSnapshots.snapshot_date))
    .limit(2);

  if (dates.length < 2) return null;

  const [currentDate, previousDate] = [dates[0]!.snapshot_date, dates[1]!.snapshot_date];

  const fetchRows = (date: Date) =>
    db
      .select({
        operator_id: statsSnapshots.operator_id,
        band_id: statsSnapshots.band_id,
        permits_count: statsSnapshots.permits_count,
        operator_name: operators.name,
        band_name: bands.name,
      })
      .from(statsSnapshots)
      .leftJoin(operators, eq(statsSnapshots.operator_id, operators.id))
      .leftJoin(bands, eq(statsSnapshots.band_id!, bands.id))
      .where(and(eq(statsSnapshots.snapshot_date, date), isNotNull(statsSnapshots.band_id)));

  const [currentRows, previousRows] = await Promise.all([fetchRows(currentDate), fetchRows(previousDate)]);

  const opNames = new Map<number, string>();
  const currentByOp = new Map<number, number>();
  const previousByOp = new Map<number, number>();

  for (const row of currentRows) {
    opNames.set(row.operator_id, row.operator_name ?? `Operator ${row.operator_id}`);
    currentByOp.set(row.operator_id, (currentByOp.get(row.operator_id) ?? 0) + row.permits_count);
  }
  for (const row of previousRows) {
    previousByOp.set(row.operator_id, (previousByOp.get(row.operator_id) ?? 0) + row.permits_count);
  }

  const allOpIds = new Set([...currentByOp.keys(), ...previousByOp.keys()]);
  const byOperator = [...allOpIds]
    .map((id) => ({
      id,
      name: opNames.get(id) ?? `Operator ${id}`,
      permitsDelta: (currentByOp.get(id) ?? 0) - (previousByOp.get(id) ?? 0),
    }))
    .filter((op) => op.permitsDelta !== 0)
    .sort((a, b) => Math.abs(b.permitsDelta) - Math.abs(a.permitsDelta))
    .slice(0, 10);

  const bandNames = new Map<number, string>();
  const currentByBand = new Map<number, number>();
  const previousByBand = new Map<number, number>();

  for (const row of currentRows) {
    bandNames.set(row.band_id!, row.band_name ?? `Band ${row.band_id}`);
    currentByBand.set(row.band_id!, (currentByBand.get(row.band_id!) ?? 0) + row.permits_count);
  }
  for (const row of previousRows) {
    previousByBand.set(row.band_id!, (previousByBand.get(row.band_id!) ?? 0) + row.permits_count);
  }

  const allBandIds = new Set([...currentByBand.keys(), ...previousByBand.keys()]);
  const byBand = [...allBandIds]
    .map((id) => ({
      id,
      name: bandNames.get(id) ?? `Band ${id}`,
      permitsDelta: (currentByBand.get(id) ?? 0) - (previousByBand.get(id) ?? 0),
    }))
    .filter((b) => b.permitsDelta !== 0)
    .sort((a, b) => Math.abs(b.permitsDelta) - Math.abs(a.permitsDelta))
    .slice(0, 10);

  return { byOperator, byBand };
}

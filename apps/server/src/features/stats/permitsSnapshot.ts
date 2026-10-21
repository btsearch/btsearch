import { officialPermits, officialSites, operators, statsSnapshots } from "@openbts/drizzle";
import { formatPermitLabel } from "@openbts/shared/permitLabel";
import { and, count, countDistinct, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "../../database/psql.js";
import type { DbTx } from "../../types/global.js";
import { logger } from "../../utils/logger.js";

const SNAPSHOT_KEY = [
  statsSnapshots.snapshot_date,
  statsSnapshots.operator_id,
  statsSnapshots.rat,
  statsSnapshots.label_mhz,
  statsSnapshots.label_variant,
];

export async function takeStatsSnapshot(writer: Pick<DbTx, "select" | "insert"> = db): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [labelRows, operatorRows] = await Promise.all([
    writer
      .select({
        operator_id: officialSites.operator_id,
        rat: officialPermits.rat,
        label_mhz: officialPermits.label_mhz,
        label_variant: officialPermits.label_variant,
        unique_stations_count: countDistinct(officialPermits.official_site_id),
        permits_count: count(),
      })
      .from(officialPermits)
      .innerJoin(officialSites, eq(officialPermits.official_site_id, officialSites.id))
      .where(isNotNull(officialPermits.label_mhz))
      .groupBy(officialSites.operator_id, officialPermits.rat, officialPermits.label_mhz, officialPermits.label_variant),
    writer
      .select({
        operator_id: officialSites.operator_id,
        unique_stations_count: countDistinct(officialPermits.official_site_id),
      })
      .from(officialPermits)
      .innerJoin(officialSites, eq(officialPermits.official_site_id, officialSites.id))
      .groupBy(officialSites.operator_id),
  ]);

  if (labelRows.length === 0) {
    logger.info("Stats snapshot: no permit data found, skipping");
    return;
  }

  await writer
    .insert(statsSnapshots)
    .values(labelRows.map((row) => ({ snapshot_date: today, ...row })))
    .onConflictDoUpdate({
      target: SNAPSHOT_KEY,
      set: {
        unique_stations_count: sql`excluded.unique_stations_count`,
        permits_count: sql`excluded.permits_count`,
      },
    });

  await writer
    .insert(statsSnapshots)
    .values(
      operatorRows.map((row) => ({
        snapshot_date: today,
        operator_id: row.operator_id,
        rat: null,
        label_mhz: null,
        label_variant: null,
        unique_stations_count: row.unique_stations_count,
        permits_count: 0,
      })),
    )
    .onConflictDoUpdate({
      target: SNAPSHOT_KEY,
      set: {
        unique_stations_count: sql`excluded.unique_stations_count`,
      },
    });

  logger.info(`Stats snapshot: saved ${labelRows.length} label rows + ${operatorRows.length} operator rows for ${today.toISOString().slice(0, 10)}`);
}

export interface SnapshotOperatorDelta {
  id: number;
  name: string;
  permitsDelta: number;
}

export interface SnapshotBandDelta {
  id: string;
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
        rat: statsSnapshots.rat,
        label_mhz: statsSnapshots.label_mhz,
        label_variant: statsSnapshots.label_variant,
        permits_count: statsSnapshots.permits_count,
        operator_name: operators.name,
      })
      .from(statsSnapshots)
      .leftJoin(operators, eq(statsSnapshots.operator_id, operators.id))
      .where(and(eq(statsSnapshots.snapshot_date, date), isNotNull(statsSnapshots.rat)));

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

  const labelNames = new Map<string, string>();
  const currentByLabel = new Map<string, number>();
  const previousByLabel = new Map<string, number>();

  const addByLabel = (rows: typeof currentRows, byLabel: Map<string, number>) => {
    for (const row of rows) {
      if (row.rat === null || row.label_mhz === null || row.label_variant === null) continue;

      const label = `${row.rat}:${row.label_mhz}:${row.label_variant}`;
      labelNames.set(label, formatPermitLabel({ rat: row.rat, mhz: row.label_mhz, variant: row.label_variant }));
      byLabel.set(label, (byLabel.get(label) ?? 0) + row.permits_count);
    }
  };
  addByLabel(currentRows, currentByLabel);
  addByLabel(previousRows, previousByLabel);

  const byBand = [...labelNames]
    .map(([id, name]) => ({
      id,
      name,
      permitsDelta: (currentByLabel.get(id) ?? 0) - (previousByLabel.get(id) ?? 0),
    }))
    .filter((b) => b.permitsDelta !== 0)
    .sort((a, b) => Math.abs(b.permitsDelta) - Math.abs(a.permitsDelta))
    .slice(0, 10);

  return { byOperator, byBand };
}

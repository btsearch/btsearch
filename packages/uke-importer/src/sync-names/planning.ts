import { extraIdentificators, operators, stations } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm/sql/expressions/conditions";

import { DATABASE_READ_CONCURRENCY, DATABASE_STATEMENT_BATCH_SIZE, mapInConcurrentBatches } from "../database-batching.js";
import { db } from "../database.js";
import { chunk } from "../utils.js";
import { PREVIEW_LIMIT } from "./logger.js";
import type { ExistingExtraIdentifier, FileSpec, OperatorPlan, OperatorSpec, TargetMnoName } from "./types.js";

interface MatchingStation {
  id: number;
  station_id: string;
}

export async function loadOperatorIds(files: FileSpec[]): Promise<Map<string, number>> {
  const operatorNames = Array.from(new Set(files.map((file) => file.operator.name)));
  const rows = await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray(operators.name, operatorNames));
  return new Map(rows.map((row) => [row.name, row.id]));
}

async function findMatchingStations(operatorId: number, stationIds: string[]): Promise<MatchingStation[]> {
  const groupedRows = await mapInConcurrentBatches(chunk(stationIds, DATABASE_STATEMENT_BATCH_SIZE), DATABASE_READ_CONCURRENCY, (stationIdGroup) =>
    db
      .select({ id: stations.id, station_id: stations.station_id })
      .from(stations)
      .where(and(eq(stations.operator_id, operatorId), inArray(stations.station_id, stationIdGroup))),
  );
  return groupedRows.flat();
}

async function loadExistingExtraIdentifiers(stationPks: number[]): Promise<ExistingExtraIdentifier[]> {
  const groupedRows = await mapInConcurrentBatches(chunk(stationPks, DATABASE_STATEMENT_BATCH_SIZE), DATABASE_READ_CONCURRENCY, (stationPkGroup) =>
    db
      .select({ id: extraIdentificators.id, station_id: extraIdentificators.station_id, mno_name: extraIdentificators.mno_name })
      .from(extraIdentificators)
      .where(inArray(extraIdentificators.station_id, stationPkGroup)),
  );
  return groupedRows.flat();
}

export async function buildOperatorPlan(operator: OperatorSpec, operatorId: number, stationMnoNames: Map<string, string>): Promise<OperatorPlan> {
  const stationIds = Array.from(stationMnoNames.keys());
  const matchingStations = await findMatchingStations(operatorId, stationIds);
  const matchedStationIds = new Set(matchingStations.map((station) => station.station_id));
  const missingStationIds = stationIds.filter((stationId) => !matchedStationIds.has(stationId));

  const targets = matchingStations
    .map((station): TargetMnoName | null => {
      const mnoName = stationMnoNames.get(station.station_id);
      if (mnoName === undefined) return null;
      return { stationPk: station.id, stationId: station.station_id, mnoName };
    })
    .filter((target): target is TargetMnoName => target !== null);

  const existingRows = await loadExistingExtraIdentifiers(targets.map((target) => target.stationPk));
  const existingByStationPk = new Map<number, ExistingExtraIdentifier[]>();
  for (const row of existingRows) {
    const rows = existingByStationPk.get(row.station_id) ?? [];
    rows.push(row);
    existingByStationPk.set(row.station_id, rows);
  }

  const inserts: TargetMnoName[] = [];
  const updates: OperatorPlan["updates"] = [];
  let unchangedCount = 0;

  for (const target of targets) {
    const existing = existingByStationPk.get(target.stationPk) ?? [];
    if (existing.length === 0) {
      inserts.push(target);
      continue;
    }

    const changedRows = existing.filter((row) => row.mno_name !== target.mnoName);
    if (changedRows.length === 0) {
      unchangedCount++;
      continue;
    }

    updates.push({
      ...target,
      extraIdentifierIds: changedRows.map((row) => row.id),
      oldMnoName: changedRows[0]?.mno_name ?? null,
    });
  }

  const preview: OperatorPlan["preview"] = [
    ...inserts.map((target) => ({
      stationPk: target.stationPk,
      stationId: target.stationId,
      oldMnoName: null,
      newMnoName: target.mnoName,
      action: "insert" as const,
    })),
    ...updates.map((target) => ({
      stationPk: target.stationPk,
      stationId: target.stationId,
      oldMnoName: target.oldMnoName,
      newMnoName: target.mnoName,
      action: "update" as const,
    })),
  ].slice(0, PREVIEW_LIMIT);

  return {
    operator,
    operatorId,
    inputStationCount: stationIds.length,
    matchedStationCount: matchingStations.length,
    missingStationIds,
    unchangedCount,
    inserts,
    updates,
    preview,
  };
}

import { boardSocs, calibrationRuns, deviceModels, devices, socs, taCalibrations, taGroups } from "@openbts/drizzle";
import { MEASUREMENT_READER_SOURCES, TIMING_ADVANCE_RATS, TIMING_ADVANCE_STEP_METERS } from "@openbts/shared/contract";
import type { MeasurementDeviceTimingAdvance, TimingAdvanceRat } from "@openbts/shared/contract";
import { type SQLWrapper, and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { CONTRACT_RATS } from "../../stations/serialize.js";

const CALIBRATION_WINDOW_NIGHTS = 7;
const UNKNOWN_MODEM_FAMILY = "other";

export type TimingAdvanceFit = { taGroupId: number; rat: TimingAdvanceRat; metersPerStep: number; offsetMeters: number };

function roundToCentimeters(meters: number): number {
  return Math.round(meters * 100) / 100;
}

export function timingAdvanceRatOf(rat: keyof typeof CONTRACT_RATS): TimingAdvanceRat | undefined {
  return TIMING_ADVANCE_RATS.find((candidate) => candidate === CONTRACT_RATS[rat]);
}

export async function loadTimingAdvanceFits(asOfRunId: number | SQLWrapper | null, taGroupIds: readonly number[]): Promise<TimingAdvanceFit[]> {
  if (asOfRunId === null || taGroupIds.length === 0) return [];

  const asOf = alias(calibrationRuns, "as_of");
  const rows = await db
    .selectDistinctOn([taCalibrations.taGroupId, taCalibrations.rat], {
      taGroupId: taCalibrations.taGroupId,
      rat: taCalibrations.rat,
      scale: taCalibrations.scale,
      offsetM: taCalibrations.offsetM,
    })
    .from(taCalibrations)
    .innerJoin(calibrationRuns, eq(calibrationRuns.id, taCalibrations.calibrationRunId))
    .innerJoin(asOf, eq(asOf.id, asOfRunId))
    .where(
      and(
        inArray(taCalibrations.taGroupId, [...taGroupIds]),
        sql`(${calibrationRuns.runAt}, ${calibrationRuns.id}) <= (${asOf.runAt}, ${asOf.id})`,
        sql`(${asOf.runAt} AT TIME ZONE 'UTC')::date - (${calibrationRuns.runAt} AT TIME ZONE 'UTC')::date < ${CALIBRATION_WINDOW_NIGHTS}`,
      ),
    )
    .orderBy(taCalibrations.taGroupId, taCalibrations.rat, desc(calibrationRuns.runAt), desc(calibrationRuns.id));

  return rows.flatMap(({ taGroupId, rat, scale, offsetM }) => {
    const timingAdvanceRat = timingAdvanceRatOf(rat);
    if (timingAdvanceRat === undefined) return [];
    return [
      {
        taGroupId,
        rat: timingAdvanceRat,
        metersPerStep: roundToCentimeters(TIMING_ADVANCE_STEP_METERS[timingAdvanceRat] / scale),
        offsetMeters: roundToCentimeters(-offsetM / scale),
      },
    ];
  });
}

function inTimingAdvanceOrder(a: MeasurementDeviceTimingAdvance, b: MeasurementDeviceTimingAdvance): number {
  const bySource = MEASUREMENT_READER_SOURCES.indexOf(a.source) - MEASUREMENT_READER_SOURCES.indexOf(b.source);
  return bySource === 0 ? TIMING_ADVANCE_RATS.indexOf(a.rat) - TIMING_ADVANCE_RATS.indexOf(b.rat) : bySource;
}

export async function loadTimingAdvance(deviceIds: readonly string[]): Promise<Map<string, MeasurementDeviceTimingAdvance[]>> {
  if (deviceIds.length === 0) return new Map();

  const candidates = await db
    .select({ deviceId: devices.id, taGroupId: taGroups.id, source: taGroups.source, deviceModelId: taGroups.deviceModelId })
    .from(devices)
    .innerJoin(deviceModels, eq(deviceModels.id, devices.modelId))
    .leftJoin(boardSocs, and(isNull(deviceModels.socId), eq(boardSocs.board, deviceModels.board)))
    .leftJoin(socs, eq(socs.id, sql`coalesce(${deviceModels.socId}, ${boardSocs.socId})`))
    .innerJoin(
      taGroups,
      or(eq(taGroups.deviceModelId, deviceModels.id), eq(taGroups.modemFamily, sql`coalesce(${socs.modemFamily}, ${UNKNOWN_MODEM_FAMILY})`)),
    )
    .where(inArray(devices.id, [...deviceIds]));

  const groupByDeviceAndSource = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = `${candidate.deviceId}:${candidate.source}`;
    const isModelGroup = candidate.deviceModelId !== null;
    if (isModelGroup || !groupByDeviceAndSource.has(key)) groupByDeviceAndSource.set(key, candidate);
  }
  const groups = [...groupByDeviceAndSource.values()];
  const newestCalibrationRunId = db
    .select({ id: calibrationRuns.id })
    .from(calibrationRuns)
    .orderBy(desc(calibrationRuns.runAt), desc(calibrationRuns.id))
    .limit(1);
  const fits = await loadTimingAdvanceFits(newestCalibrationRunId, unique(groups.map((group) => group.taGroupId)));
  const fitsByGroup = Map.groupBy(fits, (fit) => fit.taGroupId);

  return new Map(
    [...Map.groupBy(groups, (group) => group.deviceId)].map(([deviceId, deviceGroups]) => [
      deviceId,
      deviceGroups
        .flatMap(({ taGroupId, source }) =>
          (fitsByGroup.get(taGroupId) ?? []).map(({ rat, metersPerStep, offsetMeters }) => ({ source, rat, metersPerStep, offsetMeters })),
        )
        .sort(inTimingAdvanceOrder),
    ]),
  );
}

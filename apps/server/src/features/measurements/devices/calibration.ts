import { boardSocs, calibrationRuns, deviceModels, devices, errorModels, socs, taCalibrations, taGroups } from "@openbts/drizzle";
import { AREA_CLASSES, MEASUREMENT_READER_SOURCES, TIMING_ADVANCE_RATS, TIMING_ADVANCE_STEP_METERS } from "@openbts/shared/contract";
import type {
  MeasurementDevice,
  MeasurementDeviceTimingAdvanceCalibration,
  MeasurementDeviceTimingAdvanceErrorModel,
  TimingAdvanceRat,
} from "@openbts/shared/contract";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { calibrationWindowEnd, inCalibrationWindow, loadNewestCalibrationRun } from "../../observed/engine/calibrationWindow.js";
import { CONTRACT_RATS } from "../../stations/serialize.js";

const UNKNOWN_MODEM_FAMILY = "other";

type BySourceAndRat = Pick<MeasurementDeviceTimingAdvanceCalibration, "source" | "rat">;
type GroupErrorModel = Omit<MeasurementDeviceTimingAdvanceErrorModel, "source"> & { taGroupId: number };
export type TimingAdvanceFit = { taGroupId: number; rat: TimingAdvanceRat; metersPerStep: number; offsetMeters: number };
export type DeviceCalibration = Pick<MeasurementDevice, "timingAdvanceCalibrations" | "timingAdvanceErrorModels">;

const windowRun = alias(calibrationRuns, "window_run");
const earlierRun = alias(calibrationRuns, "earlier_run");

function roundToCentimeters(meters: number): number {
  return Math.round(meters * 100) / 100;
}

export function timingAdvanceRatOf(rat: keyof typeof CONTRACT_RATS): TimingAdvanceRat | undefined {
  return TIMING_ADVANCE_RATS.find((candidate) => candidate === CONTRACT_RATS[rat]);
}

export async function loadTimingAdvanceFits(asOfRunId: number | null, taGroupIds: readonly number[]): Promise<TimingAdvanceFit[]> {
  if (asOfRunId === null || taGroupIds.length === 0) return [];

  const rows = await db
    .selectDistinctOn([taCalibrations.taGroupId, taCalibrations.rat], {
      taGroupId: taCalibrations.taGroupId,
      rat: taCalibrations.rat,
      scale: taCalibrations.scale,
      offsetM: taCalibrations.offsetM,
    })
    .from(taCalibrations)
    .innerJoin(calibrationRuns, eq(calibrationRuns.id, taCalibrations.calibrationRunId))
    .innerJoin(calibrationWindowEnd, eq(calibrationWindowEnd.id, asOfRunId))
    .where(and(inArray(taCalibrations.taGroupId, [...taGroupIds]), inCalibrationWindow(calibrationRuns, calibrationWindowEnd)))
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

function selectFitsInForce(newestRunId: number, taGroupIds: readonly number[], name: string) {
  return db
    .selectDistinctOn([windowRun.id, taCalibrations.taGroupId, taCalibrations.rat], {
      runId: sql<number>`${windowRun.id}`.as("run_id"),
      taGroupId: sql<number>`${taCalibrations.taGroupId}`.as("ta_group_id"),
      rat: sql<string>`${taCalibrations.rat}`.as("rat"),
      fitRunId: sql<number>`${taCalibrations.calibrationRunId}`.as("fit_run_id"),
    })
    .from(windowRun)
    .innerJoin(calibrationWindowEnd, eq(calibrationWindowEnd.id, newestRunId))
    .innerJoin(earlierRun, inCalibrationWindow(earlierRun, windowRun))
    .innerJoin(taCalibrations, eq(taCalibrations.calibrationRunId, earlierRun.id))
    .where(and(inCalibrationWindow(windowRun, calibrationWindowEnd), inArray(taCalibrations.taGroupId, [...taGroupIds])))
    .orderBy(windowRun.id, taCalibrations.taGroupId, taCalibrations.rat, desc(earlierRun.runAt), desc(earlierRun.id))
    .as(name);
}

async function loadTimingAdvanceErrorModels(newestRunId: number, taGroupIds: readonly number[]): Promise<GroupErrorModel[]> {
  if (taGroupIds.length === 0) return [];

  const fittedUnder = selectFitsInForce(newestRunId, taGroupIds, "fitted_under");
  const inForce = selectFitsInForce(newestRunId, taGroupIds, "in_force");
  const isFittedUnderTheFitInForce = sql`${fittedUnder.fitRunId} IS NOT DISTINCT FROM ${inForce.fitRunId}`;
  const rows = await db
    .selectDistinctOn([errorModels.taGroupId, errorModels.rat, errorModels.areaClass], {
      taGroupId: errorModels.taGroupId,
      rat: errorModels.rat,
      areaClass: errorModels.areaClass,
      sigmaMeters: errorModels.sigmaM,
      tailMeanMeters: errorModels.tailMeanM,
      outlierShare: errorModels.outlierShare,
    })
    .from(errorModels)
    .innerJoin(calibrationRuns, eq(calibrationRuns.id, errorModels.calibrationRunId))
    .innerJoin(calibrationWindowEnd, eq(calibrationWindowEnd.id, newestRunId))
    .leftJoin(
      fittedUnder,
      and(
        eq(fittedUnder.runId, errorModels.calibrationRunId),
        eq(fittedUnder.taGroupId, errorModels.taGroupId),
        eq(fittedUnder.rat, errorModels.rat),
      ),
    )
    .leftJoin(inForce, and(eq(inForce.runId, newestRunId), eq(inForce.taGroupId, errorModels.taGroupId), eq(inForce.rat, errorModels.rat)))
    .where(
      and(inArray(errorModels.taGroupId, [...taGroupIds]), inCalibrationWindow(calibrationRuns, calibrationWindowEnd), isFittedUnderTheFitInForce),
    )
    .orderBy(errorModels.taGroupId, errorModels.rat, errorModels.areaClass, desc(calibrationRuns.runAt), desc(calibrationRuns.id));

  return rows.flatMap(({ rat, ...model }) => {
    const timingAdvanceRat = timingAdvanceRatOf(rat);
    return timingAdvanceRat === undefined ? [] : [{ ...model, rat: timingAdvanceRat }];
  });
}

function inTimingAdvanceOrder(a: BySourceAndRat, b: BySourceAndRat): number {
  return (
    MEASUREMENT_READER_SOURCES.indexOf(a.source) - MEASUREMENT_READER_SOURCES.indexOf(b.source) ||
    TIMING_ADVANCE_RATS.indexOf(a.rat) - TIMING_ADVANCE_RATS.indexOf(b.rat)
  );
}

function inErrorModelOrder(a: MeasurementDeviceTimingAdvanceErrorModel, b: MeasurementDeviceTimingAdvanceErrorModel): number {
  return inTimingAdvanceOrder(a, b) || AREA_CLASSES.indexOf(a.areaClass) - AREA_CLASSES.indexOf(b.areaClass);
}

async function loadGroupCalibrations(taGroupIds: readonly number[]): Promise<[TimingAdvanceFit[], GroupErrorModel[]]> {
  const run = taGroupIds.length === 0 ? undefined : await loadNewestCalibrationRun();
  if (run === undefined) return [[], []];
  return Promise.all([loadTimingAdvanceFits(run.id, taGroupIds), loadTimingAdvanceErrorModels(run.id, taGroupIds)]);
}

export async function loadDeviceCalibrations(deviceIds: readonly string[]): Promise<Map<string, DeviceCalibration>> {
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
  const [fits, models] = await loadGroupCalibrations(unique(groups.map((group) => group.taGroupId)));
  const fitsByGroup = Map.groupBy(fits, (fit) => fit.taGroupId);
  const modelsByGroup = Map.groupBy(models, (model) => model.taGroupId);

  return new Map(
    [...Map.groupBy(groups, (group) => group.deviceId)].map(([deviceId, deviceGroups]) => [
      deviceId,
      {
        timingAdvanceCalibrations: deviceGroups
          .flatMap(({ taGroupId, source }) =>
            (fitsByGroup.get(taGroupId) ?? []).map(({ rat, metersPerStep, offsetMeters }) => ({ source, rat, metersPerStep, offsetMeters })),
          )
          .sort(inTimingAdvanceOrder),
        timingAdvanceErrorModels: deviceGroups
          .flatMap(({ taGroupId, source }) =>
            (modelsByGroup.get(taGroupId) ?? []).map(({ rat, areaClass, sigmaMeters, tailMeanMeters, outlierShare }) => ({
              source,
              rat,
              areaClass,
              sigmaMeters,
              tailMeanMeters,
              outlierShare,
            })),
          )
          .sort(inErrorModelOrder),
      },
    ]),
  );
}

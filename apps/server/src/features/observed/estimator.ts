import { calibrationRuns, ellipseScales, levelModels } from "@openbts/drizzle";
import type { ObservedEstimator } from "@openbts/shared/contract";
import { desc, eq } from "drizzle-orm";

import db from "../../database/psql.js";
import { loadCrowdSettings } from "../measurements/settings.js";
import { CONTRACT_RATS } from "../stations/serialize.js";
import { calibrationWindowEnd, inCalibrationWindow, loadNewestCalibrationRun } from "./engine/calibrationWindow.js";

export const ESTIMATOR_CACHE_CONTROL = "public, max-age=3600";

function selectNewestLevelModels(newestRunId: number) {
  return db
    .selectDistinctOn([levelModels.rat, levelModels.areaClass], {
      rat: levelModels.rat,
      areaClass: levelModels.areaClass,
      slopeDbPerDecade: levelModels.slopeDbPerDecade,
      scatterDb: levelModels.scatterDb,
    })
    .from(levelModels)
    .innerJoin(calibrationRuns, eq(calibrationRuns.id, levelModels.calibrationRunId))
    .innerJoin(calibrationWindowEnd, eq(calibrationWindowEnd.id, newestRunId))
    .where(inCalibrationWindow(calibrationRuns, calibrationWindowEnd))
    .orderBy(levelModels.rat, levelModels.areaClass, desc(calibrationRuns.runAt), desc(calibrationRuns.id));
}

function selectNewestEllipseScales(newestRunId: number) {
  return db
    .selectDistinctOn([ellipseScales.evidenceClass, ellipseScales.isSurrounded], {
      evidenceClass: ellipseScales.evidenceClass,
      isSurrounded: ellipseScales.isSurrounded,
      scale: ellipseScales.scale,
    })
    .from(ellipseScales)
    .innerJoin(calibrationRuns, eq(calibrationRuns.id, ellipseScales.calibrationRunId))
    .innerJoin(calibrationWindowEnd, eq(calibrationWindowEnd.id, newestRunId))
    .where(inCalibrationWindow(calibrationRuns, calibrationWindowEnd))
    .orderBy(ellipseScales.evidenceClass, ellipseScales.isSurrounded, desc(calibrationRuns.runAt), desc(calibrationRuns.id));
}

export async function loadEstimator(): Promise<ObservedEstimator> {
  const [run, settings] = await Promise.all([loadNewestCalibrationRun(), loadCrowdSettings()]);
  const [levels, ellipses] = run === undefined ? [[], []] : await Promise.all([selectNewestLevelModels(run.id), selectNewestEllipseScales(run.id)]);

  return {
    algorithmVersion: settings.publishedAlgorithmVersion,
    publicRadiusMaxMeters: settings.publicRadiusMaxM,
    calibration: run === undefined ? null : { id: run.id, runAt: run.runAt.toISOString() },
    ellipseScales: ellipses,
    levelModels: levels.flatMap(({ rat, ...model }) => {
      const cellRat = CONTRACT_RATS[rat];
      return cellRat === undefined ? [] : [{ rat: cellRat, ...model }];
    }),
  };
}

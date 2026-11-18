import { calibrationRuns } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, and, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";

const CALIBRATION_WINDOW_NIGHTS = 7;

export type CalibrationRunColumns = { runAt: SQLWrapper; id: SQLWrapper };

export const calibrationWindowEnd = alias(calibrationRuns, "window_end");

export async function loadNewestCalibrationRun(): Promise<{ id: number; runAt: Date } | undefined> {
  const [run] = await db
    .select({ id: calibrationRuns.id, runAt: calibrationRuns.runAt })
    .from(calibrationRuns)
    .orderBy(desc(calibrationRuns.runAt), desc(calibrationRuns.id))
    .limit(1);
  return run;
}

export function inCalibrationWindow(run: CalibrationRunColumns, end: CalibrationRunColumns): SQL | undefined {
  return and(
    sql`(${run.runAt}, ${run.id}) <= (${end.runAt}, ${end.id})`,
    sql`(${end.runAt} AT TIME ZONE 'UTC')::date - (${run.runAt} AT TIME ZONE 'UTC')::date < ${CALIBRATION_WINDOW_NIGHTS}`,
  );
}

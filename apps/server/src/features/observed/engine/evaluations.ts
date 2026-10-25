import {
  calibrationRuns,
  deviceModels,
  ellipseScales,
  errorModels,
  evaluationResults,
  evaluationRuns,
  gnbLengthTests,
  groupingResults,
  levelModels,
  readerScores,
  readerVersions,
  readers,
  snapPriors,
  snappingBands,
  snappingResults,
  taCalibrations,
  taGroups,
} from "@openbts/drizzle";
import type {
  EvaluationScore,
  ObservationEvaluation,
  ObservationEvaluationDetail,
  ObservationEvaluationListQuery,
  Paging,
} from "@openbts/shared/contract";
import { type SQL, and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../../database/psql.js";
import { createKeyset } from "../../../lib/keyset.js";
import { timingAdvanceRatOf } from "../../measurements/devices/calibration.js";
import { CONTRACT_RATS } from "../../stations/serialize.js";
import { suggestedLengthOf } from "../flags/gnbLength.js";

const BASELINE_VERSION = 0;
const PROBABILITY_BANDS = 10;

const evaluationRunSelectSchema = createSelectSchema(evaluationRuns);
const evaluationResultSelectSchema = createSelectSchema(evaluationResults);

type EvaluationRunRow = z.infer<typeof evaluationRunSelectSchema>;
type EvaluationResultRow = z.infer<typeof evaluationResultSelectSchema>;

function toScore(row: EvaluationResultRow): EvaluationScore {
  const isBaseline = row.algorithmVersion === BASELINE_VERSION;
  return {
    algorithmVersion: row.algorithmVersion,
    sites: row.siteCount,
    errorMeters: { p50: row.errorP50M, p80: row.errorP80M, p95: row.errorP95M },
    insideRadius: isBaseline ? null : row.insideRadiusCount,
    ambiguous: isBaseline ? null : row.ambiguousCount,
  };
}

function breakdownValue({ dimension, dimensionValue }: EvaluationResultRow): string {
  return dimension === "rat" ? dimensionValue.toLowerCase() : dimensionValue;
}

function toEvaluation(run: EvaluationRunRow, results: readonly EvaluationResultRow[]): ObservationEvaluation {
  return {
    id: run.id,
    runAt: run.runAt.toISOString(),
    scoredHalf: run.stationHalf,
    groundTruthStations: run.groundTruthCount,
    calibrationId: run.calibrationRunId,
    overall: results.filter((row) => row.evaluationRunId === run.id && row.dimension === "all").map(toScore),
  };
}

function selectResults(condition: SQL | undefined) {
  return db
    .select()
    .from(evaluationResults)
    .where(condition)
    .orderBy(
      asc(evaluationResults.evaluationRunId),
      desc(evaluationResults.algorithmVersion),
      asc(evaluationResults.dimension),
      asc(evaluationResults.dimensionValue),
    );
}

export async function fetchEvaluationPage({
  limit,
  cursor,
  includeTotal,
}: ObservationEvaluationListQuery): Promise<{ data: ObservationEvaluation[]; paging: Paging }> {
  const keyset = createKeyset("-id", evaluationRuns.id, { id: null }, cursor);
  const [runs, totals] = await Promise.all([
    db
      .select()
      .from(evaluationRuns)
      .where(keyset.after)
      .orderBy(...keyset.orderBy)
      .limit(limit + 1),
    includeTotal ? db.select({ total: count() }).from(evaluationRuns) : null,
  ]);
  const page = runs.slice(0, limit);
  const last = page.at(-1);
  const runIds = page.map((run) => run.id);
  const results =
    runIds.length === 0 ? [] : await selectResults(and(inArray(evaluationResults.evaluationRunId, runIds), eq(evaluationResults.dimension, "all")));

  const paging: Paging = { limit, nextCursor: runs.length > limit && last ? keyset.cursorAfter({ id: last.id, key: null }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return { data: page.map((run) => toEvaluation(run, results)), paging };
}

function namedValues(evaluationRunId: number, dimension: "taGroup" | "reader") {
  return db
    .select({ value: evaluationResults.dimensionValue })
    .from(evaluationResults)
    .where(and(eq(evaluationResults.evaluationRunId, evaluationRunId), eq(evaluationResults.dimension, dimension)));
}

function selectNamedTaGroups(evaluationRunId: number, calibrationRunId: number | null) {
  const named = [inArray(sql`${taGroups.id}::text`, namedValues(evaluationRunId, "taGroup"))];
  if (calibrationRunId !== null) {
    named.push(
      inArray(
        taGroups.id,
        db.select({ id: taCalibrations.taGroupId }).from(taCalibrations).where(eq(taCalibrations.calibrationRunId, calibrationRunId)),
      ),
      inArray(taGroups.id, db.select({ id: errorModels.taGroupId }).from(errorModels).where(eq(errorModels.calibrationRunId, calibrationRunId))),
    );
  }
  return db
    .select({ group: taGroups, model: { id: deviceModels.id, manufacturer: deviceModels.manufacturer, model: deviceModels.model } })
    .from(taGroups)
    .leftJoin(deviceModels, eq(deviceModels.id, taGroups.deviceModelId))
    .where(or(...named))
    .orderBy(asc(taGroups.id));
}

function selectNamedReaderVersions(evaluationRunId: number) {
  return db
    .select({ id: readerVersions.id, reader: readerVersions.readerName, source: readers.source, version: readerVersions.version })
    .from(readerVersions)
    .innerJoin(readers, eq(readers.name, readerVersions.readerName))
    .where(
      or(
        inArray(
          readerVersions.id,
          db.select({ id: readerScores.readerVersionId }).from(readerScores).where(eq(readerScores.evaluationRunId, evaluationRunId)),
        ),
        inArray(sql`${readerVersions.id}::text`, namedValues(evaluationRunId, "reader")),
      ),
    )
    .orderBy(asc(readerVersions.id));
}

async function loadCalibration(calibrationRunId: number) {
  const [timingAdvance, errors, levels, ellipses, priors] = await Promise.all([
    db
      .select()
      .from(taCalibrations)
      .where(eq(taCalibrations.calibrationRunId, calibrationRunId))
      .orderBy(asc(taCalibrations.taGroupId), asc(taCalibrations.rat)),
    db
      .select()
      .from(errorModels)
      .where(eq(errorModels.calibrationRunId, calibrationRunId))
      .orderBy(asc(errorModels.taGroupId), asc(errorModels.rat), asc(errorModels.areaClass)),
    db.select().from(levelModels).where(eq(levelModels.calibrationRunId, calibrationRunId)).orderBy(asc(levelModels.rat), asc(levelModels.areaClass)),
    db
      .select()
      .from(ellipseScales)
      .where(eq(ellipseScales.calibrationRunId, calibrationRunId))
      .orderBy(asc(ellipseScales.evidenceClass), asc(ellipseScales.isSurrounded)),
    db.select().from(snapPriors).where(eq(snapPriors.calibrationRunId, calibrationRunId)).orderBy(asc(snapPriors.kind), asc(snapPriors.sameOperator)),
  ]);

  return {
    timingAdvance: timingAdvance.flatMap(({ taGroupId, rat, scale, offsetM, rowCount, stationCount }) => {
      const timingAdvanceRat = timingAdvanceRatOf(rat);
      return timingAdvanceRat === undefined
        ? []
        : [{ taGroupId, rat: timingAdvanceRat, scale, offsetMeters: offsetM, rows: rowCount, stations: stationCount }];
    }),
    errorModels: errors.flatMap(({ taGroupId, rat, areaClass, sigmaM, tailMeanM, outlierShare, rowCount }) => {
      const timingAdvanceRat = timingAdvanceRatOf(rat);
      return timingAdvanceRat === undefined
        ? []
        : [{ taGroupId, rat: timingAdvanceRat, areaClass, sigmaMeters: sigmaM, tailMeanMeters: tailMeanM, outlierShare, rows: rowCount }];
    }),
    levelModels: levels.flatMap(({ rat, areaClass, slopeDbPerDecade, scatterDb, binCount }) => {
      const cellRat = CONTRACT_RATS[rat];
      return cellRat === undefined ? [] : [{ rat: cellRat, areaClass, slopeDbPerDecade, scatterDb, squares: binCount }];
    }),
    ellipseScales: ellipses.map(({ evidenceClass, isSurrounded, scale, siteCount }) => ({ evidenceClass, isSurrounded, scale, sites: siteCount })),
    snapPriors: priors.map(({ kind, sameOperator, prior }) => ({ kind, isSameOperator: sameOperator, prior })),
  };
}

export async function fetchEvaluationDetail(id: number): Promise<ObservationEvaluationDetail | null> {
  const [found] = await db
    .select({ run: evaluationRuns, calibration: calibrationRuns })
    .from(evaluationRuns)
    .leftJoin(calibrationRuns, eq(calibrationRuns.id, evaluationRuns.calibrationRunId))
    .where(eq(evaluationRuns.id, id))
    .limit(1);
  if (!found) return null;

  const { run, calibration } = found;
  const [results, snapping, bands, grouping, readerRows, gnbLengths, namedGroups, namedVersions, fitted] = await Promise.all([
    selectResults(eq(evaluationResults.evaluationRunId, id)),
    db
      .select()
      .from(snappingResults)
      .where(eq(snappingResults.evaluationRunId, id))
      .orderBy(desc(snappingResults.algorithmVersion), asc(snappingResults.kind)),
    db
      .select()
      .from(snappingBands)
      .where(eq(snappingBands.evaluationRunId, id))
      .orderBy(desc(snappingBands.algorithmVersion), asc(snappingBands.band)),
    db.select().from(groupingResults).where(eq(groupingResults.evaluationRunId, id)).orderBy(desc(groupingResults.algorithmVersion)),
    db.select().from(readerScores).where(eq(readerScores.evaluationRunId, id)).orderBy(asc(readerScores.readerVersionId)),
    db.select().from(gnbLengthTests).where(eq(gnbLengthTests.evaluationRunId, id)).orderBy(asc(gnbLengthTests.plmn), asc(gnbLengthTests.length)),
    selectNamedTaGroups(id, calibration?.id ?? null),
    selectNamedReaderVersions(id),
    calibration === null ? null : loadCalibration(calibration.id),
  ]);
  const suggestedLengths = new Map(
    [...Map.groupBy(gnbLengths, (test) => test.plmn)].map(([plmn, network]) => [plmn, suggestedLengthOf(network)?.length]),
  );

  return {
    ...toEvaluation(run, results),
    breakdown: results.flatMap((row) => (row.dimension === "all" ? [] : [{ ...toScore(row), dimension: row.dimension, value: breakdownValue(row) }])),
    snapping: snapping.flatMap(({ algorithmVersion, kind, possible, right, wrong, missed }) =>
      kind === "none" ? [] : [{ algorithmVersion, kind, possible, right, wrong, missed }],
    ),
    snappingBands: bands.map(({ algorithmVersion, band, snaps, right }) => ({
      algorithmVersion,
      fromProbability: band / PROBABILITY_BANDS,
      toProbability: (band + 1) / PROBABILITY_BANDS,
      snaps,
      right,
    })),
    grouping: grouping.map(({ algorithmVersion, groups, right, wrong, missed }) => ({ algorithmVersion, groups, right, wrong, missed })),
    readers: readerRows.map((row) => ({
      readerVersionId: row.readerVersionId,
      uploads: row.uploads,
      timingAdvance: { onConfirmed: row.taOnConfirmed, withinTolerance: row.taWithinTolerance },
      values: { agreed: row.valuesAgreed, differed: row.valuesDiffered },
      onlyCells: row.onlyCells,
    })),
    gnbLengths: gnbLengths.map(({ plmn, length, isCutLength, cells, together, apart, sites }) => ({
      plmn,
      length,
      isCutLength,
      isSuggested: suggestedLengths.get(plmn) === length,
      cells,
      together,
      apart,
      sites,
    })),
    taGroups: namedGroups.map(({ group, model }) => ({ id: group.id, source: group.source, modemFamily: group.modemFamily, deviceModel: model })),
    readerVersions: namedVersions,
    calibration:
      calibration === null || fitted === null
        ? null
        : { id: calibration.id, runAt: calibration.runAt.toISOString(), fittedHalf: calibration.stationHalf, ...fitted },
  };
}

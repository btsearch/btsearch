import {
  calibrationRuns,
  evaluationResults,
  evaluationRuns,
  gnbLengthTests,
  readerScores,
  readerVersions,
  readers,
  snappingBands,
  taCalibrations,
  taGroups,
} from "@openbts/drizzle";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";

import { fetchEvaluationDetail, fetchEvaluationPage } from "../../../../src/features/observed/engine/evaluations.js";
import type { DbTx } from "../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

function score(evaluationRunId: number, algorithmVersion: number, dimension: "all" | "rat" | "taGroup" | "reader", dimensionValue: string) {
  const isBaseline = algorithmVersion === 0;
  return {
    evaluationRunId,
    algorithmVersion,
    dimension,
    dimensionValue,
    siteCount: 40,
    errorP50M: 90,
    errorP80M: 200,
    errorP95M: 500,
    insideRadiusCount: isBaseline ? 0 : 37,
    ambiguousCount: isBaseline ? 0 : 2,
  };
}

async function writeNight(tx: DbTx, runAt: string) {
  const [calibration] = await tx
    .insert(calibrationRuns)
    .values({ runAt: new Date(runAt), stationHalf: "even" })
    .returning({ id: calibrationRuns.id });
  if (!calibration) throw new Error("The calibration run was not written");

  const [night] = await tx
    .insert(evaluationRuns)
    .values({ runAt: new Date(runAt), calibrationRunId: calibration.id, stationHalf: "odd", groundTruthCount: 120 })
    .returning({ id: evaluationRuns.id });
  if (!night) throw new Error("The night was not written");
  return { calibrationRunId: calibration.id, evaluationRunId: night.id };
}

async function addReaderVersion(tx: DbTx): Promise<number> {
  const name = `eval-${randomUUID().slice(0, 8)}`;
  await tx.insert(readers).values({ name, source: "modemLog" });
  const [version] = await tx.insert(readerVersions).values({ readerName: name, version: "1.2.0" }).returning({ id: readerVersions.id });
  if (!version) throw new Error("The reader version was not added");
  return version.id;
}

async function familyGroup(tx: DbTx): Promise<number> {
  const [group] = await tx
    .insert(taGroups)
    .values({ source: "api", modemFamily: "unisoc" })
    .onConflictDoUpdate({ target: [taGroups.source, taGroups.modemFamily], set: { source: sql`excluded.source` } })
    .returning({ id: taGroups.id });
  if (!group) throw new Error("The group was not added");
  return group.id;
}

describeOnCrowdDatabase("the nightly evaluations", () => {
  it("answers a night as the engine writes it: the baseline without radius counts, the groups and readers it names, technologies in lower case and bands in tenths", () =>
    rolledBack(async (tx) => {
      const { calibrationRunId, evaluationRunId } = await writeNight(tx, "2099-02-06T01:38:00Z");
      const namedReader = await addReaderVersion(tx);
      const scoredReader = await addReaderVersion(tx);
      const breakdownGroup = await familyGroup(tx);
      await tx
        .insert(evaluationResults)
        .values([
          score(evaluationRunId, 1, "all", "all"),
          score(evaluationRunId, 0, "all", "all"),
          score(evaluationRunId, 1, "rat", "LTE"),
          score(evaluationRunId, 1, "taGroup", String(breakdownGroup)),
          score(evaluationRunId, 1, "reader", String(namedReader)),
          score(evaluationRunId, 1, "reader", "none"),
        ]);
      await tx.insert(readerScores).values({
        evaluationRunId,
        readerVersionId: scoredReader,
        uploads: 12,
        taOnConfirmed: 300,
        taWithinTolerance: 280,
        valuesAgreed: 900,
        valuesDiffered: 4,
        onlyCells: 1,
      });
      await tx.insert(snappingBands).values({ evaluationRunId, algorithmVersion: 1, band: 9, snaps: 6, right: 5 });
      await tx
        .insert(taCalibrations)
        .values({ calibrationRunId, taGroupId: breakdownGroup, rat: "LTE", scale: 1.02, offsetM: 12, rowCount: 2100, stationCount: 22 });

      const night = await fetchEvaluationDetail(evaluationRunId);
      expect(night?.overall).toEqual([
        { algorithmVersion: 1, sites: 40, errorMeters: { p50: 90, p80: 200, p95: 500 }, insideRadius: 37, ambiguous: 2 },
        { algorithmVersion: 0, sites: 40, errorMeters: { p50: 90, p80: 200, p95: 500 }, insideRadius: null, ambiguous: null },
      ]);
      expect(night?.breakdown.map(({ dimension, value }) => `${dimension}:${value}`)).toEqual(
        expect.arrayContaining(["rat:lte", `taGroup:${breakdownGroup}`, `reader:${namedReader}`, "reader:none"]),
      );
      expect(night?.taGroups.map((group) => group.id)).toEqual([breakdownGroup]);
      expect(night?.readerVersions.map((version) => version.id).toSorted((a, b) => a - b)).toEqual(
        [namedReader, scoredReader].toSorted((a, b) => a - b),
      );
      expect(night?.snappingBands).toEqual([{ algorithmVersion: 1, fromProbability: 0.9, toProbability: 1, snaps: 6, right: 5 }]);
      expect(night?.calibration?.timingAdvance).toEqual([
        { taGroupId: breakdownGroup, rat: "lte", scale: 1.02, offsetMeters: 12, rows: 2100, stations: 22 },
      ]);
    }));

  it("answers the gNB length test of a Sunday's night and none on another night", () =>
    rolledBack(async (tx) => {
      const sunday = await writeNight(tx, "2099-02-01T01:38:00Z");
      const monday = await writeNight(tx, "2099-02-02T01:38:00Z");
      await tx.insert(gnbLengthTests).values({
        evaluationRunId: sunday.evaluationRunId,
        plmn: "99971",
        length: 24,
        isCutLength: true,
        cells: 30,
        together: 25,
        apart: 1,
        sites: 6,
      });

      expect((await fetchEvaluationDetail(sunday.evaluationRunId))?.gnbLengths).toEqual([
        { plmn: "99971", length: 24, isCutLength: true, isSuggested: true, cellCount: 30, together: 25, apart: 1, sites: 6 },
      ]);
      expect((await fetchEvaluationDetail(monday.evaluationRunId))?.gnbLengths).toEqual([]);
    }));

  it("pages the nights newest first", () =>
    rolledBack(async (tx) => {
      const earlier = await writeNight(tx, "2099-03-01T01:38:00Z");
      const later = await writeNight(tx, "2099-03-02T01:38:00Z");

      const first = await fetchEvaluationPage({ limit: 1 });
      if (first.paging.nextCursor === null) throw new Error("The first page has no cursor");
      const second = await fetchEvaluationPage({ limit: 1, cursor: first.paging.nextCursor });

      expect([...first.data, ...second.data].map((night) => night.id)).toEqual([later.evaluationRunId, earlier.evaluationRunId]);
    }));
});

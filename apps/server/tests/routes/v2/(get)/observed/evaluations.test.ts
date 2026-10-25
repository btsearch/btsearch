import { describe, expect, it } from "vitest";

import getEvaluation from "../../../../../src/routes/v2/(get)/observed/evaluations/[id].js";
import getEvaluations from "../../../../../src/routes/v2/(get)/observed/evaluations/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";
import { signInAs } from "../../../../helpers/officialFixtures.js";

const runAt = new Date("2026-11-04T01:38:12Z");

function runRow(id: number) {
  return { id, runAt, calibrationRunId: id, stationHalf: "odd", groundTruthCount: 15_610 };
}

function resultRow(overrides: Record<string, unknown> = {}) {
  return {
    evaluationRunId: 41,
    algorithmVersion: 1,
    dimension: "all",
    dimensionValue: "all",
    siteCount: 1840,
    errorP50M: 96,
    errorP80M: 210,
    errorP95M: 540,
    insideRadiusCount: 1731,
    ambiguousCount: 62,
    ...overrides,
  };
}

function read(route: typeof getEvaluations | typeof getEvaluation, url: string, role: "admin" | "editor" = "admin") {
  return injectMutation(route, { method: "GET", url }, signInAs(role));
}

describe("GET /observed/evaluations", () => {
  it("lists the nights with their overall scores, the baseline's radius counts as null", async () => {
    dbMock.enqueueFor("select", "evaluation_runs", [runRow(41), runRow(40)], [{ total: 2 }]);
    dbMock.enqueueFor("select", "evaluation_results", [
      resultRow(),
      resultRow({ algorithmVersion: 0, siteCount: 1838, errorP50M: 412, errorP80M: 980, errorP95M: 2310, insideRadiusCount: 0, ambiguousCount: 0 }),
    ]);
    const response = await read(getEvaluations, "/observed/evaluations?limit=1&includeTotal=true");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        {
          id: 41,
          scoredHalf: "odd",
          overall: [
            { algorithmVersion: 1, sites: 1840, errorMeters: { p50: 96, p80: 210, p95: 540 }, insideRadius: 1731, ambiguous: 62 },
            { algorithmVersion: 0, sites: 1838, insideRadius: null, ambiguous: null },
          ],
        },
      ],
      paging: { limit: 1, nextCursor: expect.any(String), total: 2 },
    });
  });

  it("refuses an editor", async () => {
    expectError(await read(getEvaluations, "/observed/evaluations", "editor"), 403, "INSUFFICIENT_PERMISSIONS");
  });
});

describe("GET /observed/evaluations/:id", () => {
  it("answers technologies in lower case, probabilities in tenths and the groups the night names", async () => {
    dbMock.enqueueFor("select", "evaluation_runs", [{ run: runRow(41), calibration: { id: 41, runAt, stationHalf: "even" } }]);
    dbMock.enqueueFor("select", "evaluation_results", [
      resultRow(),
      resultRow({ dimension: "rat", dimensionValue: "LTE" }),
      resultRow({ dimension: "taGroup", dimensionValue: "9" }),
      resultRow({ algorithmVersion: 0, dimension: "rat", dimensionValue: "unknown", insideRadiusCount: 0, ambiguousCount: 0 }),
    ]);
    dbMock.enqueueFor("select", "snapping_results", [
      { evaluationRunId: 41, algorithmVersion: 1, kind: "officialSite", possible: 10, right: 7, wrong: 1, missed: 3 },
    ]);
    dbMock.enqueueFor("select", "snapping_bands", [{ evaluationRunId: 41, algorithmVersion: 1, band: 8, snaps: 5, right: 4 }]);
    dbMock.enqueueFor("select", "grouping_results", []);
    dbMock.enqueueFor("select", "reader_scores", [
      { readerVersionId: 3, uploads: 12, taOnConfirmed: 300, taWithinTolerance: 280, valuesAgreed: 900, valuesDiffered: 4, onlyCells: 1 },
    ]);
    dbMock.enqueueFor("select", "gnb_length_tests", [
      { plmn: "26003", length: 24, isCutLength: true, cells: 30, together: 5, apart: 9, sites: 11 },
      { plmn: "26003", length: 28, isCutLength: false, cells: 30, together: 26, apart: 1, sites: 6 },
      { plmn: "26006", length: 28, isCutLength: true, cells: 30, together: 25, apart: 1, sites: 6 },
      { plmn: "26006", length: 29, isCutLength: false, cells: 30, together: 23, apart: 0, sites: 5 },
    ]);
    dbMock.enqueueFor("select", "ta_groups", [
      { group: { id: 9, source: "api", modemFamily: "samsung", deviceModelId: null, createdAt: runAt }, model: null },
    ]);
    dbMock.enqueueFor("select", "reader_versions", []);
    dbMock.enqueueFor("select", "ta_calibrations", [
      { calibrationRunId: 41, taGroupId: 9, rat: "LTE", scale: 2, offsetM: 12, rowCount: 2400, stationCount: 31 },
    ]);
    dbMock.enqueueFor("select", "error_models", []);
    dbMock.enqueueFor("select", "level_models", []);
    dbMock.enqueueFor("select", "ellipse_scales", []);
    dbMock.enqueueFor("select", "snap_priors", []);
    const response = await read(getEvaluation, "/observed/evaluations/41");

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.calibrationId).toBe(41);
    expect(data.breakdown.map(({ dimension, value }: { dimension: string; value: string }) => [dimension, value])).toEqual([
      ["rat", "lte"],
      ["taGroup", "9"],
      ["rat", "unknown"],
    ]);
    expect(data.breakdown[2]).toMatchObject({ algorithmVersion: 0, insideRadius: null, ambiguous: null });
    expect(data.snappingBands).toEqual([{ algorithmVersion: 1, fromProbability: 0.8, toProbability: 0.9, snaps: 5, right: 4 }]);
    expect(data.taGroups).toEqual([{ id: 9, source: "api", modemFamily: "samsung", deviceModel: null }]);
    expect(data.readers).toEqual([
      {
        readerVersionId: 3,
        uploads: 12,
        timingAdvance: { onConfirmed: 300, withinTolerance: 280 },
        values: { agreed: 900, differed: 4 },
        onlyCells: 1,
      },
    ]);
    expect(
      data.gnbLengths.map(({ plmn, length, isSuggested }: { plmn: string; length: number; isSuggested: boolean }) => [plmn, length, isSuggested]),
    ).toEqual([
      ["26003", 24, false],
      ["26003", 28, true],
      ["26006", 28, true],
      ["26006", 29, false],
    ]);
    expect(data.gnbLengths[2]).toEqual({
      plmn: "26006",
      length: 28,
      isCutLength: true,
      isSuggested: true,
      cells: 30,
      together: 25,
      apart: 1,
      sites: 6,
    });
    expect(data.calibration).toMatchObject({
      id: 41,
      fittedHalf: "even",
      timingAdvance: [{ taGroupId: 9, rat: "lte", scale: 2, offsetMeters: 12, rows: 2400, stations: 31 }],
    });
  });

  it("answers 404 for a night that does not exist", async () => {
    dbMock.enqueueFor("select", "evaluation_runs", []);
    expectError(await read(getEvaluation, "/observed/evaluations/7"), 404, "NOT_FOUND");
  });
});

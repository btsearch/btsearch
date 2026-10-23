import { MEASUREMENT_UPLOAD_LIMITS, type MeasurementBatch, measurementBatchSchema } from "@openbts/shared/contract";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fixturesDirectory = new URL("../../../../../engine/fixtures/v1/", import.meta.url);
const fixtureNames = readdirSync(fixturesDirectory).filter((name) => name.endsWith(".json"));
const HOUR_MILLIS = 3_600_000;

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, fixturesDirectory), "utf8"));
}

const upload = measurementBatchSchema.parse(readFixture("appendix-a.json"));

function changed(change: (document: MeasurementBatch) => void): unknown {
  const document = structuredClone(upload);
  change(document);
  return document;
}

describe("format version 1 fixtures", () => {
  it.each(fixtureNames)("%s matches the schema", (name) => expect(measurementBatchSchema.safeParse(readFixture(name)).error?.issues).toBeUndefined());
});

describe("measurementBatchSchema", () => {
  it.each([
    [
      "a measurement of a cell that is not in cells",
      changed((document) =>
        document.snapshots.forEach((snapshot) =>
          snapshot.measurements.forEach((measurement) => Object.assign(measurement, { cell: document.cells.length })),
        ),
      ),
      "Points at a cell that is not in `cells`",
    ],
    [
      "a snapshot of a reader that is not in readers",
      changed((document) => document.snapshots.forEach((snapshot) => Object.assign(snapshot, { reader: document.readers.length }))),
      "Points at a reader that is not in `readers`",
    ],
    [
      "an upload that spans too long",
      changed((document) =>
        document.fixes.forEach((fix) => Object.assign(fix, { t: fix.t + (MEASUREMENT_UPLOAD_LIMITS.spanHours + 1) * HOUR_MILLIS })),
      ),
      `Must span at most ${MEASUREMENT_UPLOAD_LIMITS.spanHours} hours`,
    ],
  ])("refuses %s", (_name, document, message) =>
    expect(measurementBatchSchema.safeParse(document).error?.issues.map((issue) => issue.message)).toEqual([message]),
  );

  it("leaves values out of range to the engine", () => {
    const document = changed((batch) =>
      batch.snapshots.forEach((snapshot) => snapshot.measurements.forEach((measurement) => Object.assign(measurement, { rsrpDbm: 2_147_483_647 }))),
    );
    expect(measurementBatchSchema.safeParse(document).success).toBe(true);
  });
});

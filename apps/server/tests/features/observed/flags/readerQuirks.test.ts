import { measurementReadingBlockCreateSchema } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { type ActiveBlock, type CheckTotal, type PatternTotal, raiseReaderQuirkFlags } from "../../../../src/features/observed/flags/readerQuirks.js";

const MODEL_ID = 7;
const SOC_ID = 3;
const models = new Map([[MODEL_ID, { id: MODEL_ID, manufacturer: "Acme", model: "A1", socId: SOC_ID, modemFamily: "mediatek" as const }]]);
const readerVersions = new Map([[12, { id: 12, reader: "netmonster", source: "api" as const, version: "3.1.0" }]]);
const swappedTacs: PatternTotal = {
  groupId: MODEL_ID,
  field: "areaCode",
  pattern: "bytesSwapped",
  parameter: 0,
  values: 30,
  cells: 11,
  uploads: 4,
  people: 3,
};
const areaCodeChecks: CheckTotal = { groupId: MODEL_ID, field: "areaCode", agreed: 200, differed: 40 };
const noTotals = { patterns: [], checks: [] };

function judge(patterns: PatternTotal[], checks: CheckTotal[] = [areaCodeChecks], blocks: ActiveBlock[] = []) {
  return raiseReaderQuirkFlags({ byReaderVersion: noTotals, byDeviceModel: { patterns, checks }, readerVersions, models, blocks });
}

function raise(patterns: PatternTotal[], checks: CheckTotal[] = [areaCodeChecks], blocks: ActiveBlock[] = []) {
  return judge(patterns, checks, blocks).raised;
}

function block(overrides: Partial<ActiveBlock>): ActiveBlock {
  return { readerVersionId: null, deviceModelId: null, socId: null, modemFamily: null, fields: null, ...overrides };
}

describe("readerQuirk", () => {
  it("opens for a device model with 30 swapped TACs from 4 uploads, suggesting a block the reading-blocks route takes once you add a reason", () => {
    const [flag, ...others] = raise([swappedTacs]);

    expect(others).toEqual([]);
    expect(flag).toEqual({
      kind: "readerQuirk",
      subjectKey: `deviceModel:${MODEL_ID}:areaCode:bytesSwapped:0`,
      refs: { deviceModelId: MODEL_ID },
      evidence: {
        field: "areaCode",
        pattern: "bytesSwapped",
        parameter: null,
        readerVersion: null,
        deviceModel: { id: MODEL_ID, manufacturer: "Acme", model: "A1" },
        valueCount: 30,
        cellCount: 11,
        uploadCount: 4,
      },
      suggestion: { readingBlock: { phones: { deviceModelId: MODEL_ID }, fields: ["areaCode"], mode: "drop" } },
      measure: { people: 3 },
    });
    expect(measurementReadingBlockCreateSchema.safeParse({ ...flag?.suggestion.readingBlock, reason: "Swapped TAC bytes" }).success).toBe(true);
  });

  it("opens one for a reader version too, keeping the factor's parameter", () => {
    const factor: PatternTotal = { ...swappedTacs, groupId: 12, pattern: "factor", parameter: 256 };
    const { raised: flags } = raiseReaderQuirkFlags({
      byReaderVersion: { patterns: [factor], checks: [{ ...areaCodeChecks, groupId: 12 }] },
      byDeviceModel: noTotals,
      readerVersions,
      models,
      blocks: [],
    });

    expect(flags).toMatchObject([
      {
        subjectKey: "readerVersion:12:areaCode:factor:256",
        refs: { readerVersionId: 12 },
        evidence: {
          pattern: "factor",
          parameter: 256,
          readerVersion: { id: 12, reader: "netmonster", source: "api", version: "3.1.0" },
          deviceModel: null,
        },
      },
    ]);
  });

  it("opens nothing for scattered offsets, or when the model rarely differs", () => {
    const offsets = [3, 7, 12].map((parameter): PatternTotal => ({ ...swappedTacs, pattern: "offset", parameter, values: 20 }));
    expect(raise(offsets, [{ ...areaCodeChecks, differed: 60 }])).toEqual([]);
    expect(raise([swappedTacs], [{ ...areaCodeChecks, agreed: 400 }])).toEqual([]);
    expect(raise([{ ...swappedTacs, uploads: 2 }])).toEqual([]);
  });

  it("closes as fixed while a block that is on covers the model, by its SoC or modem family, and that field", () => {
    const fixed = [{ kind: "readerQuirk", subjectKey: `deviceModel:${MODEL_ID}:areaCode:bytesSwapped:0` }];

    expect(judge([swappedTacs], [areaCodeChecks], [block({ socId: SOC_ID, fields: ["areaCode", "pci"] })])).toEqual({ raised: [], fixed });
    expect(judge([swappedTacs], [areaCodeChecks], [block({ modemFamily: "mediatek" })])).toEqual({ raised: [], fixed });
    expect(judge([swappedTacs], [areaCodeChecks], [block({ deviceModelId: MODEL_ID, fields: ["pci"] })])).toMatchObject({
      raised: [{ kind: "readerQuirk" }],
      fixed: [],
    });
  });
});

import { boardSocs, calibrationRuns, socs, taCalibrations, taGroups } from "@openbts/drizzle";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";

import { loadTimingAdvance, loadTimingAdvanceFits } from "../../../../src/features/measurements/devices/calibration.js";
import type { DbTx } from "../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import { insertDevice, insertPerson } from "../../../helpers/measurementFixtures.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const NEWEST_RUN_AT = "2099-01-10T23:00:00Z";

type Source = "api" | "modemLog" | "modemPoll";
type Family = "qualcomm" | "samsung" | "mediatek" | "unisoc" | "hisilicon" | "other";

function uniqueName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function addSoc(tx: DbTx, modemFamily: Family): Promise<number> {
  const [soc] = await tx
    .insert(socs)
    .values({ manufacturer: "Calibration test", model: uniqueName("soc"), modemFamily })
    .returning({ id: socs.id });
  if (!soc) throw new Error("The SoC was not added");
  return soc.id;
}

async function addDevice(tx: DbTx, model: { socId?: number; board?: string }): Promise<{ deviceId: string; modelId: number }> {
  return insertDevice(tx, { userId: await insertPerson(tx), ...model });
}

async function familyGroup(tx: DbTx, source: Source, modemFamily: Family): Promise<number> {
  const [group] = await tx
    .insert(taGroups)
    .values({ source, modemFamily })
    .onConflictDoUpdate({ target: [taGroups.source, taGroups.modemFamily], set: { source: sql`excluded.source` } })
    .returning({ id: taGroups.id });
  if (!group) throw new Error("The group was not added");
  return group.id;
}

async function modelGroup(tx: DbTx, source: Source, deviceModelId: number): Promise<number> {
  const [group] = await tx.insert(taGroups).values({ source, deviceModelId }).returning({ id: taGroups.id });
  if (!group) throw new Error("The group was not added");
  return group.id;
}

async function addRun(tx: DbTx, runAt: string): Promise<number> {
  const [run] = await tx
    .insert(calibrationRuns)
    .values({ runAt: new Date(runAt), stationHalf: "even" })
    .returning({ id: calibrationRuns.id });
  if (!run) throw new Error("The calibration run was not added");
  return run.id;
}

async function fit(tx: DbTx, calibrationRunId: number, taGroupId: number, rat: "GSM" | "UMTS" | "LTE" | "NR", scale: number, offsetM = 0) {
  await tx.insert(taCalibrations).values({ calibrationRunId, taGroupId, rat, scale, offsetM, rowCount: 2000, stationCount: 20 });
}

describeOnCrowdDatabase("a device's timing-advance calibration", () => {
  it("takes the model's own group for its source and the modem family's for the others", () =>
    rolledBack(async (tx) => {
      const samsung = await addSoc(tx, "samsung");
      const { deviceId, modelId } = await addDevice(tx, { socId: samsung });
      const runId = await addRun(tx, NEWEST_RUN_AT);
      await fit(tx, runId, await modelGroup(tx, "api", modelId), "LTE", 1);
      await fit(tx, runId, await familyGroup(tx, "api", "samsung"), "LTE", 2);
      await fit(tx, runId, await familyGroup(tx, "modemLog", "samsung"), "LTE", 1.5);

      expect((await loadTimingAdvance([deviceId])).get(deviceId)).toEqual([
        { source: "api", rat: "lte", metersPerStep: 78.07, offsetMeters: 0 },
        { source: "modemLog", rat: "lte", metersPerStep: 52.05, offsetMeters: 0 },
      ]);
    }));

  it("takes the group of `other` for a phone whose SoC is unknown, and the board's SoC family for a phone known by its board", () =>
    rolledBack(async (tx) => {
      const board = uniqueName("board");
      await tx.insert(boardSocs).values({ board, socId: await addSoc(tx, "samsung") });
      const byBoard = await addDevice(tx, { board });
      const unknown = await addDevice(tx, {});
      const runId = await addRun(tx, NEWEST_RUN_AT);
      await fit(tx, runId, await familyGroup(tx, "api", "samsung"), "LTE", 2);
      await fit(tx, runId, await familyGroup(tx, "api", "other"), "GSM", 1, -20);

      const calibration = await loadTimingAdvance([byBoard.deviceId, unknown.deviceId]);
      expect(calibration.get(byBoard.deviceId)).toEqual([{ source: "api", rat: "lte", metersPerStep: 39.04, offsetMeters: 0 }]);
      expect(calibration.get(unknown.deviceId)).toEqual([{ source: "api", rat: "gsm", metersPerStep: 553.46, offsetMeters: 20 }]);
    }));

  it("keeps a group's newest fit of the 7 UTC nights up to the run asked for, though that run has none", () =>
    rolledBack(async (tx) => {
      const newest = await addRun(tx, NEWEST_RUN_AT);
      const sixNightsBefore = await addRun(tx, "2099-01-04T00:30:00Z");
      const sevenNightsBefore = await addRun(tx, "2099-01-03T23:59:00Z");
      const threeNightsBefore = await addRun(tx, "2099-01-07T01:00:00Z");
      const [kept, newer, gone] = [
        await familyGroup(tx, "api", "qualcomm"),
        await familyGroup(tx, "api", "mediatek"),
        await familyGroup(tx, "api", "unisoc"),
      ];
      await fit(tx, sixNightsBefore, kept, "LTE", 1);
      await fit(tx, sixNightsBefore, newer, "LTE", 2);
      await fit(tx, threeNightsBefore, newer, "LTE", 1.25);
      await fit(tx, sevenNightsBefore, gone, "LTE", 1);

      const fits = await loadTimingAdvanceFits(newest, [kept, newer, gone]);
      expect(new Map(fits.map(({ taGroupId, metersPerStep }) => [taGroupId, metersPerStep]))).toEqual(
        new Map([
          [kept, 78.07],
          [newer, 62.46],
        ]),
      );
      expect(await loadTimingAdvanceFits(sevenNightsBefore, [kept, gone])).toEqual([
        { taGroupId: gone, rat: "lte", metersPerStep: 78.07, offsetMeters: 0 },
      ]);
    }));

  it("divides the step by the fit's scale and leaves UMTS out", () =>
    rolledBack(async (tx) => {
      const runId = await addRun(tx, NEWEST_RUN_AT);
      const group = await familyGroup(tx, "modemPoll", "hisilicon");
      await fit(tx, runId, group, "NR", 2, 10);
      await fit(tx, runId, group, "UMTS", 1);

      expect(await loadTimingAdvanceFits(runId, [group])).toEqual([{ taGroupId: group, rat: "nr", metersPerStep: 4.88, offsetMeters: -5 }]);
    }));
});

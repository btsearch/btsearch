import { boardSocs, deviceModels, socs } from "@openbts/drizzle";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";

import { findDeviceModelPage } from "../../../../src/features/measurements/devices/hardware.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

describeOnCrowdDatabase("listing phone models", () => {
  it("names a model's SoC, from its board when the phone named none, and finds models by manufacturer and model together", () =>
    rolledBack(async (tx) => {
      const marker = randomUUID().slice(0, 8);
      const [soc] = await tx
        .insert(socs)
        .values({ manufacturer: "Crowd test", model: `SoC ${marker}`, modemFamily: "qualcomm" })
        .returning({ id: socs.id });
      if (!soc) throw new Error("The SoC was not added");
      await tx.insert(boardSocs).values({ board: `board-${marker}`, socId: soc.id });
      const models = await tx
        .insert(deviceModels)
        .values([
          { manufacturer: "Crowd test", model: `Named ${marker}`, socId: soc.id },
          { manufacturer: "Crowd test", model: `Boarded ${marker}`, board: `board-${marker}` },
          { manufacturer: "Crowd test", model: `Unknown ${marker}`, board: "unmapped" },
        ])
        .returning({ id: deviceModels.id });

      const listed = await findDeviceModelPage({ ids: models.map((model) => model.id), limit: 50 });
      const searched = await findDeviceModelPage({ q: `crowd TEST boarded ${marker}`, limit: 50 });

      expect(listed.data.map((model) => [model.model, model.socId])).toEqual([
        [`Boarded ${marker}`, soc.id],
        [`Named ${marker}`, soc.id],
        [`Unknown ${marker}`, null],
      ]);
      expect(searched.data.map((model) => model.model)).toEqual([`Boarded ${marker}`]);
    }));
});

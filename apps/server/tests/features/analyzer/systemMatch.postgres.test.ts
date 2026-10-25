import { expect, it, vi } from "vitest";

import { matchCellsAsSystem } from "../../../src/features/analyzer/match.js";
import { describeOnCrowdDatabase, rolledBack } from "../../helpers/crowdDatabase.js";
import { addCountry, addLteBand, addLteCell, addOperator, addRegion, addStation } from "../../helpers/crowdWorld.js";

vi.mock("../../../src/database/psql.js", async () => (await import("../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QM";
const MNC = 99981;

describeOnCrowdDatabase("matchCellsAsSystem", () => {
  it("finds the cell of a station that is not published, in a hidden country whose tools leave out the analyzer", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE, { isVisible: false, tools: ["measurements"] });
      const operatorId = await addOperator(tx, COUNTRY_CODE, MNC);
      const regionId = await addRegion(tx, COUNTRY_CODE);
      const stationId = await addStation(tx, { operatorId, regionId, at: [-40.1, 35.1], status: "pending" });
      const cellId = await addLteCell(tx, { stationId, bandId: await addLteBand(tx), enbid: 1_040_001, clid: 11 });

      const [match] = await matchCellsAsSystem([{ rat: "lte", plmn: String(MNC), enbid: 1_040_001, clid: 11 }]);

      expect(match?.result).toMatchObject({ operatorId, match: "cell", reason: null, stationId, cellId, networkMatch: "own" });
    }));
});

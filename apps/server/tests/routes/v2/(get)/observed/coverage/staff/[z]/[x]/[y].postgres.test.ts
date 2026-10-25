import { expect, it, vi } from "vitest";

import { quadkeyOf } from "../../../../../../../../../src/features/observed/tiles/squares.js";
import getStaffCoverageTile from "../../../../../../../../../src/routes/v2/(get)/observed/coverage/staff/[z]/[x]/[y].js";
import { userSession } from "../../../../../../../../helpers/boundaries.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../../../../../helpers/crowdDatabase.js";
import {
  addCountry,
  addGrant,
  addObservedCell,
  addObservedSite,
  addOperator,
  addRegion,
  addUser,
  estimateSite,
} from "../../../../../../../../helpers/crowdWorld.js";
import { injectMutation } from "../../../../../../../../helpers/mutationAssertions.js";
import { addCellBin } from "../../../../../../../../helpers/trailWorld.js";
import { decodeTile } from "../../../../../../../../helpers/vectorTiles.js";

vi.mock("../../../../../../../../../src/database/psql.js", async () =>
  (await import("../../../../../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction(),
);

const COUNTRY = "QV";
const PLMN = "99971";
const ENBID = 1_040_410;
const TILE = { z: 14, x: 9148, y: 5393 };

describeOnCrowdDatabase("GET /observed/coverage/staff/:z/:x/:y", () => {
  it("gives an editor the squares of an estimated site inside their grants that is not public yet, and an editor elsewhere none", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      const [inside, elsewhere] = [await addRegion(tx, COUNTRY, [20.9, 52.1, 21.2, 52.4]), await addRegion(tx, COUNTRY, [22, 52.1, 22.3, 52.4])];
      await addOperator(tx, COUNTRY, Number(PLMN));
      const site = await addObservedSite(tx, PLMN, ENBID);
      await estimateSite(tx, site, [21.01, 52.23]);
      const cell = await addObservedCell(tx, { plmn: PLMN, cellKey: ENBID * 256 + 1, observedSiteId: site });
      await addCellBin(tx, { observedCellId: cell, bin: quadkeyOf({ zoom: 20, x: TILE.x * 64 + 1, y: TILE.y * 64 + 1 }), samples: 6, levelDbm: -80 });
      const editorOf = async (regionId: number) => {
        const userId = await addUser(tx, "editor");
        await addGrant(tx, userId, { countryCode: COUNTRY, role: "editor", isCountryWide: false, regionIds: [regionId] });
        return { session: userSession(userId, "editor") };
      };
      const squaresFor = async (options: { session: ReturnType<typeof userSession> }) => {
        const url = `/observed/coverage/staff/${TILE.z}/${TILE.x}/${TILE.y}?observedCellIds=${cell}`;
        const response = await injectMutation(getStaffCoverageTile, { method: "GET", url }, options);
        expect(response.statusCode, response.body).toBe(200);
        return (decodeTile(response.rawPayload, TILE).coverage?.features ?? []).map((feature) => feature.id);
      };

      expect(await squaresFor(await editorOf(inside))).toEqual([cell]);
      expect(await squaresFor(await editorOf(elsewhere))).toEqual([]);
    }));
});

import { countries } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { quadkeyOf } from "../../../../../../../../../src/features/observed/tiles/squares.js";
import { getRuntimeSettings, mergeRuntimeSettings } from "../../../../../../../../../src/lib/runtimeSettings.js";
import getStaffTrailTile from "../../../../../../../../../src/routes/v2/(get)/observed/trails/staff/[z]/[x]/[y].js";
import { userSession } from "../../../../../../../../helpers/boundaries.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../../../../../helpers/crowdDatabase.js";
import { addCountry, addOperator, addUser } from "../../../../../../../../helpers/crowdWorld.js";
import { injectMutation } from "../../../../../../../../helpers/mutationAssertions.js";
import { addTrailSquare } from "../../../../../../../../helpers/trailWorld.js";
import { decodeTile } from "../../../../../../../../helpers/vectorTiles.js";

vi.mock("../../../../../../../../../src/database/psql.js", async () =>
  (await import("../../../../../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction(),
);

const PRIVATE_COUNTRY = "QW";
const HIDDEN_COUNTRY = "QX";
const TILE = { z: 14, x: 9148, y: 5393 };

function squareAt(column: number, row: number): number {
  return quadkeyOf({ zoom: 20, x: TILE.x * 64 + column, y: TILE.y * 64 + row });
}

describeOnCrowdDatabase("GET /observed/trails/staff/:z/:x/:y", () => {
  it("gives an administrator the squares of hidden and private countries, while observations are off too", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, HIDDEN_COUNTRY, { isVisible: false });
      await addCountry(tx, PRIVATE_COUNTRY);
      await tx.update(countries).set({ observationsPublic: false }).where(eq(countries.code, PRIVATE_COUNTRY));
      const hidden = await addOperator(tx, HIDDEN_COUNTRY, 99_973);
      const closed = await addOperator(tx, PRIVATE_COUNTRY, 99_974);
      await addTrailSquare(tx, { plmn: "99973", channel: 1300, bin: squareAt(1, 1), held: true, levels: { 4: 4 } });
      await addTrailSquare(tx, { plmn: "99974", channel: 1300, bin: squareAt(2, 2), levels: { 4: 4 } });
      Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: false }));

      const response = await injectMutation(
        getStaffTrailTile,
        { method: "GET", url: `/observed/trails/staff/14/${TILE.x}/${TILE.y}?operatorIds=${hidden},${closed}` },
        { session: userSession(await addUser(tx, "admin"), "admin") },
      );

      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      const features = decodeTile(response.rawPayload, TILE).trails?.features ?? [];
      expect(features.map((feature) => feature.properties.operatorId).toSorted((a, b) => Number(a) - Number(b))).toEqual(
        [hidden, closed].toSorted((a, b) => a - b),
      );
    }));
});

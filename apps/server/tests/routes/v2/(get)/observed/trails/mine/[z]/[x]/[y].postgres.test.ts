import { expect, it, vi } from "vitest";

import { quadkeyOf } from "../../../../../../../../../src/features/observed/tiles/squares.js";
import getMyTrailTile from "../../../../../../../../../src/routes/v2/(get)/observed/trails/mine/[z]/[x]/[y].js";
import type { DbTx } from "../../../../../../../../../src/types/global.js";
import { userSession } from "../../../../../../../../helpers/boundaries.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../../../../../helpers/crowdDatabase.js";
import { addCountry, addOperator, addUser } from "../../../../../../../../helpers/crowdWorld.js";
import { injectMutation } from "../../../../../../../../helpers/mutationAssertions.js";
import { addPersonTrailBin } from "../../../../../../../../helpers/trailWorld.js";
import { type DecodedFeature, decodeTile } from "../../../../../../../../helpers/vectorTiles.js";

vi.mock("../../../../../../../../../src/database/psql.js", async () =>
  (await import("../../../../../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction(),
);

type TileAddress = { z: number; x: number; y: number };

const COUNTRY = "QV";
const PLMN = "99971";
const ABROAD = "99975";
const TILE: TileAddress = { z: 14, x: 9148, y: 5393 };

function squareAt(column: number, row: number): number {
  return quadkeyOf({ zoom: 18, x: TILE.x * 16 + column, y: TILE.y * 16 + row });
}

function extremes(feature: DecodedFeature) {
  const xs = feature.ring.map(({ x }) => x);
  const ys = feature.ring.map(({ y }) => y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

async function mine(userId: string, tile: TileAddress, query = "") {
  const response = await injectMutation(
    getMyTrailTile,
    { method: "GET", url: `/observed/trails/mine/${tile.z}/${tile.x}/${tile.y}${query}` },
    { session: userSession(userId, "user") },
  );
  expect(response.statusCode, response.body).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, max-age=60");
  const features = decodeTile(response.rawPayload, tile).trails?.features ?? [];
  return features.toSorted((a, b) => extremes(a).top - extremes(b).top || extremes(a).left - extremes(b).left);
}

async function addAniaAndBartek(tx: DbTx) {
  const ania = await addUser(tx);
  const bartek = await addUser(tx);
  await addPersonTrailBin(tx, { userId: ania, plmn: PLMN, bin: squareAt(1, 1), samples: 12, lastSeenOn: "2026-10-23" });
  await addPersonTrailBin(tx, { userId: ania, plmn: PLMN, bin: squareAt(2, 2), samples: 5, lastSeenOn: "2026-10-21" });
  await addPersonTrailBin(tx, { userId: bartek, plmn: PLMN, bin: squareAt(3, 3), samples: 8 });
  return { ania, bartek };
}

describeOnCrowdDatabase("GET /observed/trails/mine/:z/:x/:y", () => {
  it("answers your own zoom-18 squares and never someone else's", () =>
    rolledBack(async (tx) => {
      const { ania } = await addAniaAndBartek(tx);

      const features = await mine(ania, TILE);

      expect(features.map((feature) => ({ ...extremes(feature), ...feature.properties }))).toEqual([
        expect.objectContaining({ left: 16, top: 16, right: 32, bottom: 32, plmn: PLMN, rat: "lte", samples: 12, lastSeenOn: "2026-10-23" }),
        expect.objectContaining({ left: 32, top: 32, plmn: PLMN, samples: 5 }),
      ]);
    }));

  it("groups your squares to the map's zoom below 12 and fills a tile above 18 with its one square", () =>
    rolledBack(async (tx) => {
      const { ania } = await addAniaAndBartek(tx);

      const atZoom12 = await mine(ania, { z: 12, x: TILE.x >> 2, y: TILE.y >> 2 });
      const atZoom8 = await mine(ania, { z: 8, x: TILE.x >> 6, y: TILE.y >> 6 });
      const atZoom19 = await mine(ania, { z: 19, x: TILE.x * 32 + 2, y: TILE.y * 32 + 2 });

      expect(atZoom12.map(extremes)).toEqual([
        { left: 4, top: 4, right: 8, bottom: 8 },
        { left: 8, top: 8, right: 12, bottom: 12 },
      ]);
      expect(
        atZoom8.map((feature) => ({ ...extremes(feature), samples: feature.properties.samples, lastSeenOn: feature.properties.lastSeenOn })),
      ).toEqual([{ left: 240, top: 68, right: 244, bottom: 72, samples: 17, lastSeenOn: "2026-10-23" }]);
      expect(atZoom19.map(extremes)).toEqual([{ left: 0, top: 0, right: 256, bottom: 256 }]);
    }));

  it("keeps the networks of the operators you name, and shows a network the database does not know without them", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      const operatorId = await addOperator(tx, COUNTRY, Number(PLMN));
      const ania = await addUser(tx);
      await addPersonTrailBin(tx, { userId: ania, plmn: PLMN, bin: squareAt(1, 1), samples: 12 });
      await addPersonTrailBin(tx, { userId: ania, plmn: ABROAD, bin: squareAt(1, 1), samples: 3 });

      expect((await mine(ania, TILE)).map((feature) => feature.properties.plmn).toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
        PLMN,
        ABROAD,
      ]);
      expect((await mine(ania, TILE, `?operatorIds=${operatorId}`)).map((feature) => feature.properties.plmn)).toEqual([PLMN]);
    }));
});

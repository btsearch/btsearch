import { countries, operatorLinks } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { quadkeyOf } from "../../../../../../../../src/features/observed/tiles/squares.js";
import getTrailTile from "../../../../../../../../src/routes/v2/(get)/observed/trails/[z]/[x]/[y].js";
import type { DbTx } from "../../../../../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../../../../helpers/crowdDatabase.js";
import { addCountry, addOperator } from "../../../../../../../helpers/crowdWorld.js";
import { injectMutation } from "../../../../../../../helpers/mutationAssertions.js";
import { LTE_1800, addPlannedBand, addTrailSquare } from "../../../../../../../helpers/trailWorld.js";
import { type DecodedFeature, decodeTile, surveyorArea } from "../../../../../../../helpers/vectorTiles.js";

vi.mock("../../../../../../../../src/database/psql.js", async () =>
  (await import("../../../../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction(),
);

type TileAddress = { z: number; x: number; y: number };

const COUNTRY = "QV";
const PRIVATE_COUNTRY = "QW";
const HIDDEN_COUNTRY = "QX";
const TILE: TileAddress = { z: 14, x: 9148, y: 5393 };
const LTE_1800_CHANNEL = 1300;
const LTE_800_CHANNEL = 6300;
const NR_3500_CHANNEL = 640_000;

function squareIn(tile: TileAddress, column: number, row: number, zoom = 20): number {
  const scale = 2 ** (zoom - tile.z);
  return quadkeyOf({ zoom, x: tile.x * scale + column, y: tile.y * scale + row });
}

function parentOf(tile: TileAddress, zoom: number): TileAddress {
  const shift = tile.z - zoom;
  return { z: zoom, x: tile.x >> shift, y: tile.y >> shift };
}

async function trails(tile: TileAddress, query: string) {
  const response = await injectMutation(getTrailTile, { method: "GET", url: `/observed/trails/${tile.z}/${tile.x}/${tile.y}?${query}` });
  expect(response.statusCode, response.body).toBe(200);
  return { response, features: decodeTile(response.rawPayload, tile).trails?.features ?? [] };
}

function corner(feature: DecodedFeature): string {
  return `${Math.min(...feature.ring.map(({ x }) => x))},${Math.min(...feature.ring.map(({ y }) => y))}`;
}

function byCorner(features: readonly DecodedFeature[]): Record<string, DecodedFeature["properties"]> {
  return Object.fromEntries(features.map((feature) => [corner(feature), feature.properties]));
}

function longitudeOf(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

function latitudeOf(y: number, zoom: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** zoom))) * 180) / Math.PI;
}

async function addNetwork(tx: DbTx, countryCode: string, mnc: number): Promise<{ operatorId: number; plmn: string }> {
  return { operatorId: await addOperator(tx, countryCode, mnc), plmn: String(mnc) };
}

describeOnCrowdDatabase("GET /observed/trails/:z/:x/:y", () => {
  it("shows the squares two people, one person and only held rows measured, held rows counting like any other", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      const bandId = await addPlannedBand(tx, COUNTRY, LTE_1800);
      const { operatorId, plmn } = await addNetwork(tx, COUNTRY, 99_971);
      const [q, r, s] = [squareIn(TILE, 10, 20), squareIn(TILE, 11, 20), squareIn(TILE, 12, 20)];
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, bin: q, lastSeenOn: "2026-10-24", levels: { 5: 8 } });
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, bin: q, held: true, lastSeenOn: "2026-10-23", levels: { 4: 3, 5: 9 } });
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, bin: r, held: true, lastSeenOn: "2026-10-23", levels: { 5: 6 } });
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, bin: s, lastSeenOn: "2026-10-24", levels: { 3: 2 } });

      const { response, features } = await trails(TILE, `operatorIds=${operatorId}`);

      expect(response.headers["content-type"]).toBe("application/vnd.mapbox-vector-tile");
      expect(response.headers["cache-control"]).toBe("public, max-age=3600, stale-while-revalidate=86400");
      expect(byCorner(features)).toEqual({
        "40,80": { operatorId, rat: "lte", bandId, level: 4, samples: 20, lastSeenOn: "2026-10-24" },
        "44,80": { operatorId, rat: "lte", bandId, level: 5, samples: 6, lastSeenOn: "2026-10-23" },
        "48,80": { operatorId, rat: "lte", bandId, level: 3, samples: 2, lastSeenOn: "2026-10-24" },
      });
    }));

  it("draws a square on its own outline, with its exterior ring the right way round", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      const { operatorId, plmn } = await addNetwork(tx, COUNTRY, 99_971);
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, bin: squareIn(TILE, 10, 20), levels: { 2: 150 } });

      const { features } = await trails(TILE, `operatorIds=${operatorId}`);
      const [feature] = features;
      const [x, y] = [TILE.x * 64 + 10, TILE.y * 64 + 20];

      expect(features).toHaveLength(1);
      expect(feature!.properties).toMatchObject({ samples: 100, level: 2 });
      expect(feature!.properties).not.toHaveProperty("bandId");
      expect(surveyorArea(feature!.ring)).toBeGreaterThan(0);
      expect(feature!.bounds.west).toBeCloseTo(longitudeOf(x, 20), 9);
      expect(feature!.bounds.east).toBeCloseTo(longitudeOf(x + 1, 20), 9);
      expect(feature!.bounds.north).toBeCloseTo(latitudeOf(y, 20), 9);
      expect(feature!.bounds.south).toBeCloseTo(latitudeOf(y + 1, 20), 9);
    }));

  it("reads zoom-20 squares at zoom 14, zoom-18 squares at zooms 12 and 13 and zoom-12 squares at zoom 6", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      const { operatorId, plmn } = await addNetwork(tx, COUNTRY, 99_971);
      const [zoom13, zoom12, zoom6] = [parentOf(TILE, 13), parentOf(TILE, 12), parentOf(TILE, 6)];
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, bin: squareIn(TILE, 0, 0), levels: { 1: 1 } });
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, zoom: 18, bin: squareIn(zoom12, 5, 6, 18), levels: { 2: 2 } });
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, zoom: 12, bin: squareIn(zoom6, 7, 8, 12), levels: { 3: 3 } });
      const query = `operatorIds=${operatorId}`;

      expect(Object.keys(byCorner((await trails(TILE, query)).features))).toEqual(["0,0"]);
      expect(byCorner((await trails(zoom13, query)).features)).toEqual({ "40,48": expect.objectContaining({ samples: 2 }) });
      expect(byCorner((await trails(zoom12, query)).features)).toEqual({ "20,24": expect.objectContaining({ samples: 2 }) });
      expect(byCorner((await trails(zoom6, query)).features)).toEqual({ "28,32": expect.objectContaining({ samples: 3 }) });
    }));

  it("names the operator of each square, and gives a shared network's squares to its members", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      const first = await addNetwork(tx, COUNTRY, 99_971);
      const second = await addNetwork(tx, COUNTRY, 99_972);
      const shared = await addNetwork(tx, COUNTRY, 99_979);
      await tx.insert(operatorLinks).values([
        { operatorId: first.operatorId, relatedOperatorId: shared.operatorId, kind: "jv_member" },
        { operatorId: second.operatorId, relatedOperatorId: shared.operatorId, kind: "jv_member" },
      ]);
      await addTrailSquare(tx, { plmn: first.plmn, channel: LTE_1800_CHANNEL, bin: squareIn(TILE, 1, 1), levels: { 4: 4 } });
      await addTrailSquare(tx, { plmn: second.plmn, channel: LTE_1800_CHANNEL, bin: squareIn(TILE, 2, 2), levels: { 4: 4 } });
      const expected = {
        "4,4": expect.objectContaining({ operatorId: first.operatorId }),
        "8,8": expect.objectContaining({ operatorId: second.operatorId }),
      };

      expect(byCorner((await trails(TILE, `operatorIds=${first.operatorId},${second.operatorId}`)).features)).toEqual(expected);
      expect(byCorner((await trails(TILE, `operatorIds=${shared.operatorId}`)).features)).toEqual(expected);
    }));

  it("leaves the band out where no single band of the plan holds the channel, and filters by band and technology", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      const bandId = await addPlannedBand(tx, COUNTRY, LTE_1800);
      const { operatorId, plmn } = await addNetwork(tx, COUNTRY, 99_971);
      await addTrailSquare(tx, { plmn, channel: LTE_1800_CHANNEL, bin: squareIn(TILE, 1, 1), levels: { 4: 4 } });
      await addTrailSquare(tx, { plmn, channel: LTE_800_CHANNEL, bin: squareIn(TILE, 2, 1), levels: { 4: 4 } });
      await addTrailSquare(tx, { plmn, rat: "NR", channel: NR_3500_CHANNEL, bin: squareIn(TILE, 3, 1), levels: { 4: 4 } });
      const corners = async (filter: string) => Object.keys(byCorner((await trails(TILE, `operatorIds=${operatorId}${filter}`)).features)).toSorted();

      const everything = byCorner((await trails(TILE, `operatorIds=${operatorId}`)).features);
      expect(everything["4,4"]).toMatchObject({ bandId, rat: "lte" });
      expect(everything["8,4"]).not.toHaveProperty("bandId");
      expect(everything["12,4"]).toMatchObject({ rat: "nr" });
      expect(await corners("&bandIds=unknown")).toEqual(["12,4", "8,4"]);
      expect(await corners(`&bandIds=${bandId}`)).toEqual(["4,4"]);
      expect(await corners(`&bandIds=${bandId},unknown&rats=lte`)).toEqual(["4,4", "8,4"]);
      expect(await corners("&rats=nr")).toEqual(["12,4"]);
    }));

  it("answers an empty tile for the networks of a hidden country and of a country whose observations are not public", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, HIDDEN_COUNTRY, { isVisible: false });
      await addCountry(tx, PRIVATE_COUNTRY);
      await tx.update(countries).set({ observationsPublic: false }).where(eq(countries.code, PRIVATE_COUNTRY));
      const hidden = await addNetwork(tx, HIDDEN_COUNTRY, 99_973);
      const closed = await addNetwork(tx, PRIVATE_COUNTRY, 99_974);
      await addTrailSquare(tx, { plmn: hidden.plmn, channel: LTE_1800_CHANNEL, bin: squareIn(TILE, 1, 1), levels: { 4: 4 } });
      await addTrailSquare(tx, { plmn: closed.plmn, channel: LTE_1800_CHANNEL, bin: squareIn(TILE, 2, 2), levels: { 4: 4 } });

      const { response } = await trails(TILE, `operatorIds=${hidden.operatorId},${closed.operatorId}`);

      expect(response.rawPayload).toHaveLength(0);
    }));
});

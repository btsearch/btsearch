import { countries, siteConfirmations } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { quadkeyOf } from "../../../../../../../../src/features/observed/tiles/squares.js";
import getCoverageTile from "../../../../../../../../src/routes/v2/(get)/observed/coverage/[z]/[x]/[y].js";
import type { DbTx } from "../../../../../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../../../../helpers/crowdDatabase.js";
import {
  addCountry,
  addLteBand,
  addLteCell,
  addObservedCell,
  addObservedSite,
  addOperator,
  addRegion,
  addStation,
  estimateSite,
  matchObservedCell,
} from "../../../../../../../helpers/crowdWorld.js";
import { injectMutation } from "../../../../../../../helpers/mutationAssertions.js";
import { addCellBin, addCellCopy } from "../../../../../../../helpers/trailWorld.js";
import { type DecodedFeature, decodeTile } from "../../../../../../../helpers/vectorTiles.js";

vi.mock("../../../../../../../../src/database/psql.js", async () =>
  (await import("../../../../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction(),
);

type TileAddress = { z: number; x: number; y: number };

const COUNTRY = "QV";
const PRIVATE_COUNTRY = "QW";
const PLMN = "99971";
const PRIVATE_PLMN = "99974";
const ENBID = 1_040_400;
const TILE: TileAddress = { z: 14, x: 9148, y: 5393 };

function squareAt(column: number, row: number): number {
  return quadkeyOf({ zoom: 20, x: TILE.x * 64 + column, y: TILE.y * 64 + row });
}

function corner(feature: DecodedFeature): string {
  return `${Math.min(...feature.ring.map(({ x }) => x))},${Math.min(...feature.ring.map(({ y }) => y))}`;
}

async function coverage(observedCellIds: readonly number[], tile = TILE) {
  const response = await injectMutation(getCoverageTile, {
    method: "GET",
    url: `/observed/coverage/${tile.z}/${tile.x}/${tile.y}?observedCellIds=${observedCellIds.join(",")}`,
  });
  expect(response.statusCode, response.body).toBe(200);
  const features = decodeTile(response.rawPayload, tile).coverage?.features ?? [];
  return { response, squares: Object.fromEntries(features.map((feature) => [corner(feature), { id: feature.id, ...feature.properties }])) };
}

async function addMatchedCells(tx: DbTx, countryCode: string, plmn: string, clids: readonly number[]): Promise<number[]> {
  const operatorId = await addOperator(tx, countryCode, Number(plmn));
  const stationId = await addStation(tx, { operatorId, regionId: await addRegion(tx, countryCode), at: [21.01, 52.23] });
  const bandId = await addLteBand(tx);
  const site = await addObservedSite(tx, plmn, ENBID);
  const ids: number[] = [];
  for (const clid of clids) {
    // oxlint-disable-next-line no-await-in-loop
    const id = await addObservedCell(tx, { plmn, cellKey: ENBID * 256 + clid, observedSiteId: site });
    // oxlint-disable-next-line no-await-in-loop
    await matchObservedCell(tx, id, await addLteCell(tx, { stationId, bandId, enbid: ENBID, clid }));
    ids.push(id);
  }
  return ids;
}

async function addSite(tx: DbTx) {
  await addCountry(tx, COUNTRY);
  const [first, second] = await addMatchedCells(tx, COUNTRY, PLMN, [1, 2]);
  return { first: first!, second: second! };
}

describeOnCrowdDatabase("GET /observed/coverage/:z/:x/:y", () => {
  it("names the cell that served most in a square, or the one with the most samples where none served", () =>
    rolledBack(async (tx) => {
      const { first, second } = await addSite(tx);
      await addCellBin(tx, {
        observedCellId: first,
        bin: squareAt(1, 1),
        samples: 10,
        servingSamples: 7,
        levelDbm: -85,
        sinrDb: 12,
        lastSeenOn: "2026-10-30",
      });
      await addCellBin(tx, { observedCellId: second, bin: squareAt(1, 1), samples: 10, servingSamples: 3, levelDbm: -95 });
      await addCellBin(tx, { observedCellId: first, bin: squareAt(2, 1), samples: 4, servingSamples: 0, levelDbm: -100 });
      await addCellBin(tx, { observedCellId: second, bin: squareAt(2, 1), samples: 9, servingSamples: 0, levelDbm: -110, lastSeenOn: "2026-10-28" });

      const { response, squares } = await coverage([first, second]);

      expect(response.headers["cache-control"]).toBe("public, max-age=3600, stale-while-revalidate=86400");
      expect(squares).toEqual({
        "4,4": { id: first, observedCellId: first, level: 4, sinr: 3, servingShare: 0.7, samples: 10, cellCount: 2, lastSeenOn: "2026-10-30" },
        "8,4": { id: second, observedCellId: second, level: 2, servingShare: 0, samples: 9, cellCount: 2, lastSeenOn: "2026-10-28" },
      });
    }));

  it("leaves out a zoom-20 square where half of the samples were taken standing still, at every zoom", () =>
    rolledBack(async (tx) => {
      const { first } = await addSite(tx);
      await addCellBin(tx, { observedCellId: first, bin: squareAt(0, 0), samples: 10, stationarySamples: 5, levelDbm: -70 });
      await addCellBin(tx, { observedCellId: first, bin: squareAt(1, 0), samples: 4, stationarySamples: 1, levelDbm: -90 });

      expect((await coverage([first])).squares).toEqual({ "4,0": expect.objectContaining({ samples: 4, level: 4 }) });
      expect((await coverage([first], { z: 12, x: TILE.x >> 2, y: TILE.y >> 2 })).squares).toEqual({
        "0,0": expect.objectContaining({ samples: 4, level: 4, cellCount: 1 }),
      });
    }));

  it("counts a copy's squares as its primary's, and never shows a copy on its own", () =>
    rolledBack(async (tx) => {
      const { first } = await addSite(tx);
      const copy = await addObservedCell(tx, { plmn: "99972", cellKey: ENBID * 256 + 1, observedSiteId: null });
      await addCellCopy(tx, copy, first);
      await addCellBin(tx, { observedCellId: copy, bin: squareAt(3, 3), samples: 6, levelDbm: -80 });

      expect((await coverage([first])).squares).toEqual({ "12,12": expect.objectContaining({ id: first, samples: 6 }) });
      expect((await coverage([copy])).squares).toEqual({});
      expect((await coverage([first, copy])).squares).toEqual({});
    }));

  it("adds nothing for an unmatched cell and for a cell matched in a country whose observations are not public", () =>
    rolledBack(async (tx) => {
      const unmatched = await addObservedCell(tx, { plmn: PLMN, cellKey: ENBID * 256 + 9, observedSiteId: null });
      await addCountry(tx, PRIVATE_COUNTRY);
      await tx.update(countries).set({ observationsPublic: false }).where(eq(countries.code, PRIVATE_COUNTRY));
      const [closed] = await addMatchedCells(tx, PRIVATE_COUNTRY, PRIVATE_PLMN, [1]);
      await addCellBin(tx, { observedCellId: unmatched, bin: squareAt(1, 1), samples: 6, levelDbm: -80 });
      await addCellBin(tx, { observedCellId: closed!, bin: squareAt(2, 2), samples: 6, levelDbm: -80 });

      const { response } = await coverage([unmatched, closed!]);

      expect(response.rawPayload).toHaveLength(0);
    }));

  it("counts the cells of a public estimated site, and not those of one that is not public yet", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY);
      await addRegion(tx, COUNTRY, [20.9, 52.1, 21.2, 52.4]);
      await addOperator(tx, COUNTRY, Number(PLMN));
      const estimatedCell = async (nodeId: number) => {
        const site = await addObservedSite(tx, PLMN, nodeId);
        await estimateSite(tx, site, [21.01, 52.23]);
        return { site, cell: await addObservedCell(tx, { plmn: PLMN, cellKey: nodeId * 256 + 1, observedSiteId: site }) };
      };
      const confirmed = await estimatedCell(ENBID + 1);
      await tx.insert(siteConfirmations).values({ observedSiteId: confirmed.site, basis: "twoPeople" });
      const unconfirmed = await estimatedCell(ENBID + 2);
      await addCellBin(tx, { observedCellId: confirmed.cell, bin: squareAt(1, 1), samples: 6, levelDbm: -80 });
      await addCellBin(tx, { observedCellId: unconfirmed.cell, bin: squareAt(2, 2), samples: 6, levelDbm: -80 });

      expect((await coverage([confirmed.cell, unconfirmed.cell])).squares).toEqual({ "4,4": expect.objectContaining({ id: confirmed.cell }) });
    }));
});

import { cellCopies, countries } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import getObservedCells from "../../../../../../src/routes/v2/(get)/observed/cells/index.js";
import type { DbTx } from "../../../../../../src/types/global.js";
import { authBoundary, userSession } from "../../../../../helpers/boundaries.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../../helpers/crowdDatabase.js";
import {
  type Place,
  addCountry,
  addGrant,
  addLteBand,
  addLteCell,
  addObservedCell,
  addObservedSite,
  addOperator,
  addRegion,
  addStation,
  addUser,
  estimateSite,
  matchObservedCell,
} from "../../../../../helpers/crowdWorld.js";
import { injectMutation } from "../../../../../helpers/mutationAssertions.js";

vi.mock("../../../../../../src/database/psql.js", async () => (await import("../../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const VISIBLE_COUNTRY = "QS";
const HIDDEN_COUNTRY = "QT";
const PLMN = "99985";
const INSIDE_REGION: Place = [-41.0, 36.0];
const ENBID = 1_040_300;

type Session = ReturnType<typeof userSession>;

async function addCells(tx: DbTx) {
  await addCountry(tx, VISIBLE_COUNTRY);
  await addCountry(tx, HIDDEN_COUNTRY, { isVisible: false });
  const operatorId = await addOperator(tx, VISIBLE_COUNTRY, Number(PLMN));
  const region = await addRegion(tx, VISIBLE_COUNTRY, [-41.1, 35.9, -40.9, 36.1]);
  const bandId = await addLteBand(tx);
  const visibleStation = await addStation(tx, { operatorId, regionId: region, at: INSIDE_REGION });
  const hiddenStation = await addStation(tx, { operatorId, regionId: await addRegion(tx, HIDDEN_COUNTRY), at: [-42.0, 36.0] });
  const site = await addObservedSite(tx, PLMN, ENBID);
  const estimatedSite = await addObservedSite(tx, PLMN, ENBID + 1);
  await estimateSite(tx, estimatedSite, INSIDE_REGION);
  const observed = (clid: number, observedSiteId = site, seen?: [string, string] | null) =>
    addObservedCell(tx, { plmn: PLMN, cellKey: ENBID * 256 + clid, observedSiteId, seen });

  const cells = {
    region,
    matchedVisible: await observed(1),
    matchedHidden: await observed(2),
    unmatched: await observed(3),
    onEstimatedSite: await observed(4, estimatedSite),
    copy: await observed(5),
    withoutSummary: await observed(6, site, null),
  };
  await matchObservedCell(tx, cells.matchedVisible, await addLteCell(tx, { stationId: visibleStation, bandId, enbid: ENBID, clid: 1 }));
  await matchObservedCell(tx, cells.matchedHidden, await addLteCell(tx, { stationId: hiddenStation, bandId, enbid: ENBID, clid: 2 }));
  await tx.insert(cellCopies).values({ observedCellId: cells.copy, primaryCellId: cells.matchedVisible, basis: "broadcastList" });
  return cells;
}

async function listed(query: string, options: { session?: Session } = {}): Promise<{ ids: number[]; total?: number }> {
  const response = await injectMutation(getObservedCells, { method: "GET", url: `/observed/cells?plmns=${PLMN}${query}` }, options);
  expect(response.statusCode, response.body).toBe(200);
  const { data, paging } = response.json();
  return { ids: data.map((cell: { id: number }) => cell.id).toSorted((a: number, b: number) => a - b), total: paging.total };
}

describeOnCrowdDatabase("GET /observed/cells", () => {
  it("keeps a guest to the cells matched to a station outside the hidden countries, and gives an administrator every cell", () =>
    rolledBack(async (tx) => {
      const cells = await addCells(tx);
      const admin = { session: userSession(await addUser(tx, "admin"), "admin") };

      expect((await listed("")).ids).toEqual([cells.matchedVisible]);
      expect((await listed("", admin)).ids).toEqual([cells.matchedVisible, cells.matchedHidden, cells.unmatched, cells.onEstimatedSite]);
    }));

  it("gives an editor the cells of the estimated sites inside their grant as well", () =>
    rolledBack(async (tx) => {
      const cells = await addCells(tx);
      const editorId = await addUser(tx, "editor");
      await addGrant(tx, editorId, { countryCode: VISIBLE_COUNTRY, role: "editor", isCountryWide: false, regionIds: [cells.region] });
      authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => ({ success: !JSON.stringify(input).includes("manage") }));

      expect((await listed("", { session: userSession(editorId, "editor") })).ids).toEqual([cells.matchedVisible, cells.onEstimatedSite]);
    }));

  it("keeps the cells of a country whose observations are not public to its editors and the administrators", () =>
    rolledBack(async (tx) => {
      const cells = await addCells(tx);
      await tx.update(countries).set({ observationsPublic: false }).where(eq(countries.code, VISIBLE_COUNTRY));
      const admin = { session: userSession(await addUser(tx, "admin"), "admin") };
      const editorId = await addUser(tx, "editor");
      await addGrant(tx, editorId, { countryCode: VISIBLE_COUNTRY, role: "editor", isCountryWide: true });

      expect((await listed("")).ids).toEqual([]);
      expect((await listed("", admin)).ids).toContain(cells.matchedVisible);
      authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => ({ success: !JSON.stringify(input).includes("manage") }));
      expect((await listed("", { session: userSession(editorId, "editor") })).ids).toContain(cells.matchedVisible);
    }));

  it("leaves copies out unless asked for them, and never lists or counts a cell phones left no summary of", () =>
    rolledBack(async (tx) => {
      const cells = await addCells(tx);
      const admin = { session: userSession(await addUser(tx, "admin"), "admin") };

      expect(await listed("&includeTotal=true", admin)).toEqual({
        ids: [cells.matchedVisible, cells.matchedHidden, cells.unmatched, cells.onEstimatedSite],
        total: 4,
      });
      expect((await listed("&includeCopies=true", admin)).ids).toContain(cells.copy);
    }));
});

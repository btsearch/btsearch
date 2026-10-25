import { siteLinks } from "@openbts/drizzle";
import { inArray } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { linkSites } from "../../../../src/features/observed/sites/links.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import {
  addCountry,
  addLteBand,
  addLteCell,
  addObservedCell,
  addObservedSite,
  addOperator,
  addRegion,
  addStation,
  addUser,
  matchObservedCell,
} from "../../../helpers/crowdWorld.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QP";
const PLMN = "99983";
const ENBID = 1_040_100;

describeOnCrowdDatabase("linkSites", () => {
  it("keeps a link an editor made, whatever the site's cells match and when they match nothing, and links the other sites by their cells", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      const operatorId = await addOperator(tx, COUNTRY_CODE, Number(PLMN));
      const regionId = await addRegion(tx, COUNTRY_CODE);
      const matchedStation = await addStation(tx, { operatorId, regionId, at: [-40.2, 35.2] });
      const linkedStation = await addStation(tx, { operatorId, regionId, at: [-40.3, 35.2] });
      const ourCell = await addLteCell(tx, { stationId: matchedStation, bandId: await addLteBand(tx), enbid: ENBID, clid: 1 });
      const editorId = await addUser(tx, "editor");

      const linkedByHand = await addObservedSite(tx, PLMN, ENBID);
      const linkedWithoutCells = await addObservedSite(tx, PLMN, ENBID + 1);
      const unlinked = await addObservedSite(tx, PLMN, ENBID + 2);
      await matchObservedCell(tx, await addObservedCell(tx, { plmn: PLMN, cellKey: ENBID * 256 + 1, observedSiteId: linkedByHand }), ourCell);
      await matchObservedCell(tx, await addObservedCell(tx, { plmn: PLMN, cellKey: (ENBID + 2) * 256 + 1, observedSiteId: unlinked }), ourCell);
      await tx.insert(siteLinks).values([
        { observedSiteId: linkedByHand, stationId: linkedStation, kind: "matched", linkedById: editorId },
        { observedSiteId: linkedWithoutCells, stationId: linkedStation, kind: "matched", linkedById: editorId },
      ]);

      await linkSites(tx, [linkedByHand, linkedWithoutCells, unlinked]);

      const links = await tx
        .select({ observedSiteId: siteLinks.observedSiteId, stationId: siteLinks.stationId, kind: siteLinks.kind, linkedById: siteLinks.linkedById })
        .from(siteLinks)
        .where(inArray(siteLinks.observedSiteId, [linkedByHand, linkedWithoutCells, unlinked]))
        .orderBy(siteLinks.observedSiteId);
      expect(links).toEqual([
        { observedSiteId: linkedByHand, stationId: linkedStation, kind: "matched", linkedById: editorId },
        { observedSiteId: linkedWithoutCells, stationId: linkedStation, kind: "matched", linkedById: editorId },
        { observedSiteId: unlinked, stationId: matchedStation, kind: "matched", linkedById: null },
      ]);
    }));

  it("drops a link it made once no cell of the site matches a cell of ours", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      const operatorId = await addOperator(tx, COUNTRY_CODE, Number(PLMN));
      const stationId = await addStation(tx, { operatorId, regionId: await addRegion(tx, COUNTRY_CODE), at: [-40.2, 35.2] });
      const site = await addObservedSite(tx, PLMN, ENBID);
      await addObservedCell(tx, { plmn: PLMN, cellKey: ENBID * 256 + 1, observedSiteId: site });
      await tx.insert(siteLinks).values({ observedSiteId: site, stationId, kind: "matched" });

      await linkSites(tx, [site]);

      expect(
        await tx
          .select()
          .from(siteLinks)
          .where(inArray(siteLinks.observedSiteId, [site])),
      ).toEqual([]);
    }));
});

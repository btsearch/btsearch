import { stations } from "@openbts/drizzle";
import { expect, it, vi } from "vitest";

import getStations from "../../../../../src/routes/v2/(get)/stations/index.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../../helpers/crowdDatabase.js";
import { addCountry, addOperator, addRegion, addStation, added } from "../../../../helpers/crowdWorld.js";
import { injectMutation } from "../../../../helpers/mutationAssertions.js";

vi.mock("../../../../../src/database/psql.js", async () => (await import("../../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QT";
const MNC = 99981;

describeOnCrowdDatabase("GET /stations?sort=distance", () => {
  it("lists an operator's stations nearest to the point first and those without a location last, page by page", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      const operatorId = await addOperator(tx, COUNTRY_CODE, MNC);
      const regionId = await addRegion(tx, COUNTRY_CODE, [-41, 35, -40, 36]);
      const unlocated = added(
        await tx.insert(stations).values({ station_id: "CT-UNLOCATED", operator_id: operatorId, status: "published" }).returning({ id: stations.id }),
        "The station without a location",
      );
      const far = await addStation(tx, { operatorId, regionId, at: [-40.9, 35.5] });
      const near = await addStation(tx, { operatorId, regionId, at: [-40.51, 35.5] });
      const middle = await addStation(tx, { operatorId, regionId, at: [-40.6, 35.5] });
      const listPage = async (cursor?: string) => {
        const query = `operatorIds=${operatorId}&latitude=35.5&longitude=-40.5&sort=distance&limit=2${cursor === undefined ? "" : `&cursor=${cursor}`}`;
        const response = await injectMutation(getStations, { method: "GET", url: `/stations?${query}` }, { runAuth: true });
        expect(response.statusCode, response.body).toBe(200);
        return response.json() as { data: { id: number }[]; paging: { nextCursor: string | null } };
      };

      const first = await listPage();
      expect(first.data.map((station) => station.id)).toEqual([near, middle]);
      const second = await listPage(first.paging.nextCursor ?? undefined);
      expect(second.data.map((station) => station.id)).toEqual([far, unlocated.id]);
      expect(second.paging.nextCursor).toBeNull();
    }));
});

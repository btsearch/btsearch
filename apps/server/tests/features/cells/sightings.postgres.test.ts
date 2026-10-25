import { cellMatches, curatedCellSummaries, observedCellSummaries, observedCells } from "@openbts/drizzle";
import { expect, it, vi } from "vitest";

import { loadStationSightings } from "../../../src/features/cells/sightings.js";
import { describeOnCrowdDatabase, rolledBack } from "../../helpers/crowdDatabase.js";
import { addCountry, addLteBand, addLteCell, addOperator, addRegion, addStation, added } from "../../helpers/crowdWorld.js";

vi.mock("../../../src/database/psql.js", async () => (await import("../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QU";
const MNC = 99986;

describeOnCrowdDatabase("loadStationSightings", () => {
  it("spans a station's days over its cells, and leaves out a station no phone measured", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      const operatorId = await addOperator(tx, COUNTRY_CODE, MNC);
      const regionId = await addRegion(tx, COUNTRY_CODE);
      const bandId = await addLteBand(tx);
      const measured = await addStation(tx, { operatorId, regionId, at: [-40.6, 35.4] });
      const unmeasured = await addStation(tx, { operatorId, regionId, at: [-40.7, 35.4] });
      const [early, late] = [
        await addLteCell(tx, { stationId: measured, bandId, enbid: 1_040_400, clid: 1 }),
        await addLteCell(tx, { stationId: measured, bandId, enbid: 1_040_400, clid: 2 }),
      ];
      await addLteCell(tx, { stationId: unmeasured, bandId, enbid: 1_040_401, clid: 1 });
      await tx.insert(curatedCellSummaries).values([
        { cellId: early, firstSeenOn: "2026-09-20", lastSeenOn: "2026-10-10", observedCellCount: 1 },
        { cellId: late, firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-30", observedCellCount: 2 },
      ]);

      expect(await loadStationSightings([measured, unmeasured])).toEqual(
        new Map([[measured, { firstSeenOn: "2026-09-20", lastSeenOn: "2026-10-30" }]]),
      );
    }));

  it("counts the cells phones measured that match only the station, as by its eNB, next to its own cells", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      const operatorId = await addOperator(tx, COUNTRY_CODE, MNC);
      const regionId = await addRegion(tx, COUNTRY_CODE);
      const bandId = await addLteBand(tx);
      const station = await addStation(tx, { operatorId, regionId, at: [-40.6, 35.4] });
      const onlyByEnb = await addStation(tx, { operatorId, regionId, at: [-40.7, 35.4] });
      const cellId = await addLteCell(tx, { stationId: station, bandId, enbid: 1_040_402, clid: 1 });
      await tx.insert(curatedCellSummaries).values({ cellId, firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-10", observedCellCount: 1 });
      const observedCell = async (cellKey: number, seen: [string, string]) => {
        const cell = added(
          await tx
            .insert(observedCells)
            .values({ plmn: String(MNC), rat: "LTE", cellKey })
            .returning({ id: observedCells.id }),
          "The observed cell",
        );
        await tx
          .insert(observedCellSummaries)
          .values({ observedCellId: cell.id, sampleCount: 40, contributorCount: 2, personCount: 2, firstSeenOn: seen[0], lastSeenOn: seen[1] });
        return cell.id;
      };
      const [stationMatch, enbOnlyMatch] = [
        await observedCell(1_040_402 * 256 + 9, ["2026-09-15", "2026-10-05"]),
        await observedCell(1_040_403 * 256 + 1, ["2026-10-20", "2026-10-28"]),
      ];
      await tx.insert(cellMatches).values([
        { observedCellId: stationMatch, kind: "station", networkMatch: "own", stationId: station },
        { observedCellId: enbOnlyMatch, kind: "station", networkMatch: "own", stationId: onlyByEnb },
      ]);

      expect(await loadStationSightings([station, onlyByEnb])).toEqual(
        new Map([
          [station, { firstSeenOn: "2026-09-15", lastSeenOn: "2026-10-10" }],
          [onlyByEnb, { firstSeenOn: "2026-10-20", lastSeenOn: "2026-10-28" }],
        ]),
      );
    }));
});

import { cellMatches, cellValues, curatedCellSummaries, observationFlags, siteLinks } from "@openbts/drizzle";
import { and, eq, isNull } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { matchCellsNow } from "../../../../src/features/observed/cells/matching.js";
import type { DbTx } from "../../../../src/types/global.js";
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
  daysAgo,
} from "../../../helpers/crowdWorld.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QV";
const PLMN = "99987";
const ENBID = 1_040_500;
const ANIA = 0b01n;
const BARTEK = 0b10n;
const CELINA = 0b100n;

async function reported(tx: DbTx, observedCellId: number, field: "pci" | "bandwidth", value: number, contributorBits: bigint, lastSeenOn: string) {
  await tx
    .insert(cellValues)
    .values({ observedCellId, field, value, held: false, sampleCount: 40, contributorBits, firstSeenOn: daysAgo(5), lastSeenOn });
}

describeOnCrowdDatabase("matchCellsNow", () => {
  it("matches an observed cell to ours, links its site, keeps the bandwidth two people reported and flags the PCI phones see instead of ours", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      const operatorId = await addOperator(tx, COUNTRY_CODE, Number(PLMN));
      const stationId = await addStation(tx, { operatorId, regionId: await addRegion(tx, COUNTRY_CODE), at: [-40.8, 35.5] });
      const cellId = await addLteCell(tx, { stationId, bandId: await addLteBand(tx), enbid: ENBID, clid: 7, pci: 214 });
      const siteId = await addObservedSite(tx, PLMN, ENBID);
      const observedCellId = await addObservedCell(tx, {
        plmn: PLMN,
        cellKey: ENBID * 256 + 7,
        observedSiteId: siteId,
        seen: [daysAgo(5), daysAgo(0)],
      });
      await reported(tx, observedCellId, "pci", 301, ANIA | BARTEK, daysAgo(0));
      await reported(tx, observedCellId, "bandwidth", 20_000, ANIA | BARTEK, daysAgo(1));
      await reported(tx, observedCellId, "bandwidth", 15_000, CELINA, daysAgo(0));

      await matchCellsNow([observedCellId]);

      expect(await tx.select().from(cellMatches).where(eq(cellMatches.observedCellId, observedCellId))).toMatchObject([
        { kind: "cell", networkMatch: "own", cellId, stationId: null },
      ]);
      expect(await tx.select().from(siteLinks).where(eq(siteLinks.observedSiteId, siteId))).toMatchObject([{ stationId, kind: "matched" }]);
      expect(await tx.select().from(curatedCellSummaries).where(eq(curatedCellSummaries.cellId, cellId))).toEqual([
        { cellId, firstSeenOn: daysAgo(5), lastSeenOn: daysAgo(0), observedCellCount: 1, bandwidthKhz: 20_000 },
      ]);
      const flags = await tx
        .select({ kind: observationFlags.kind, evidence: observationFlags.evidence, suggestion: observationFlags.suggestion })
        .from(observationFlags)
        .where(and(eq(observationFlags.cellId, cellId), isNull(observationFlags.closedReason)));
      expect(flags).toEqual([
        {
          kind: "valueDiffers",
          evidence: { field: "pci", observed: 301, stored: 214, samples: 40, people: 2, lastSeenOn: daysAgo(0) },
          suggestion: { cells: [{ action: "update", id: cellId, pci: 301 }] },
        },
      ]);
    }));
});

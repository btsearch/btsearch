import { observationFlags, observedCells, observedSites, siteReplacements } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { observedSiteSubject } from "../../../../src/features/observed/flags/subjects.js";
import { closedFlagValues } from "../../../../src/features/observed/flags/sync.js";
import { recutNrSites } from "../../../../src/features/observed/sites/nrPlacement.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import { addCountry, addObservedCell, addObservedSite, addOperator } from "../../../helpers/crowdWorld.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const COUNTRY_CODE = "QN";
const PLMN = "99982";
const CELLS_PER_GNB = 2 ** (36 - 24);

describeOnCrowdDatabase("recutNrSites", () => {
  it("cuts again the sites whose cells another gNB id length put together, and leaves those cut with the network's length", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      await addOperator(tx, COUNTRY_CODE, Number(PLMN));
      const cutOtherwise = await addObservedSite(tx, PLMN, 4_660, "NR");
      const cutRight = await addObservedSite(tx, PLMN, 0x20_0000, "NR");
      const first = await addObservedCell(tx, { plmn: PLMN, rat: "NR", cellKey: 0x12_3456 * CELLS_PER_GNB + 1, observedSiteId: cutOtherwise });
      const second = await addObservedCell(tx, { plmn: PLMN, rat: "NR", cellKey: 0x12_3457 * CELLS_PER_GNB + 2, observedSiteId: cutOtherwise });
      const kept = await addObservedCell(tx, { plmn: PLMN, rat: "NR", cellKey: 0x20_0000 * CELLS_PER_GNB + 3, observedSiteId: cutRight });

      await recutNrSites();

      const placed = await tx
        .select({ cellId: observedCells.id, siteId: observedSites.id, nodeId: observedSites.nodeId, retiredAt: observedSites.retiredAt })
        .from(observedCells)
        .innerJoin(observedSites, eq(observedSites.id, observedCells.observedSiteId))
        .where(inArray(observedCells.id, [first, second, kept]))
        .orderBy(observedCells.id);
      expect(placed.map(({ cellId, nodeId, retiredAt }) => ({ cellId, nodeId, retiredAt }))).toEqual([
        { cellId: first, nodeId: 0x12_3456, retiredAt: null },
        { cellId: second, nodeId: 0x12_3457, retiredAt: null },
        { cellId: kept, nodeId: 0x20_0000, retiredAt: null },
      ]);
      expect(placed[2]?.siteId).toBe(cutRight);
      const [retired] = await tx.select({ retiredAt: observedSites.retiredAt }).from(observedSites).where(eq(observedSites.id, cutOtherwise));
      expect(retired?.retiredAt).not.toBeNull();
      const replacements = await tx
        .select({ replacedBySiteId: siteReplacements.replacedBySiteId })
        .from(siteReplacements)
        .where(eq(siteReplacements.observedSiteId, cutOtherwise));
      expect(replacements.map((row) => row.replacedBySiteId).toSorted((a, b) => a - b)).toEqual(
        placed
          .slice(0, 2)
          .map((row) => row.siteId)
          .toSorted((a, b) => a - b),
      );
    }));

  it("keeps a dismissed site flag closed on the sites that replace the one it was raised on", () =>
    rolledBack(async (tx) => {
      await addCountry(tx, COUNTRY_CODE);
      await addOperator(tx, COUNTRY_CODE, Number(PLMN));
      const cutOtherwise = await addObservedSite(tx, PLMN, 4_660, "NR");
      await addObservedCell(tx, { plmn: PLMN, rat: "NR", cellKey: 0x12_3456 * CELLS_PER_GNB + 1, observedSiteId: cutOtherwise });
      await addObservedCell(tx, { plmn: PLMN, rat: "NR", cellKey: 0x12_3457 * CELLS_PER_GNB + 2, observedSiteId: cutOtherwise });
      const subjectKey = (nodeId: number) => observedSiteSubject({ plmn: PLMN, rat: "NR", nodeId, stationId: null });
      await tx.insert(observationFlags).values({
        kind: "unmatchedSite",
        subjectKey: subjectKey(4_660),
        observedSiteId: cutOtherwise,
        evidence: {},
        measure: { people: 3, latitude: 50.06, longitude: 19.93, radiusMeters: 400 },
        ...closedFlagValues("dismissed", null),
        dismissedReason: "notAnIssue",
      });

      await recutNrSites();

      const dismissed = await tx
        .select({ subjectKey: observationFlags.subjectKey, nodeId: observedSites.nodeId, closedReason: observationFlags.closedReason })
        .from(observationFlags)
        .innerJoin(observedSites, eq(observedSites.id, observationFlags.observedSiteId))
        .where(inArray(observationFlags.subjectKey, [subjectKey(4_660), subjectKey(0x12_3456), subjectKey(0x12_3457)]))
        .orderBy(observationFlags.id);
      expect(dismissed).toEqual([
        { subjectKey: subjectKey(4_660), nodeId: 4_660, closedReason: "dismissed" },
        { subjectKey: subjectKey(0x12_3456), nodeId: 0x12_3456, closedReason: "dismissed" },
        { subjectKey: subjectKey(0x12_3457), nodeId: 0x12_3457, closedReason: "dismissed" },
      ]);
    }));
});

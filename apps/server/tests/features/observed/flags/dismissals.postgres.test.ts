import { observationFlags, observedCells } from "@openbts/drizzle";
import { eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { z } from "zod/v4";

import { passFlagsOfGoneObservations } from "../../../../src/features/observed/flags/cells/pass.js";
import type { RaisedFlag } from "../../../../src/features/observed/flags/kinds.js";
import { observedCellSubject } from "../../../../src/features/observed/flags/subjects.js";
import { closedFlagValues, flagsIn, syncFlags } from "../../../../src/features/observed/flags/sync.js";
import type { DbTx } from "../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";
import { addObservedCell, addObservedSite } from "../../../helpers/crowdWorld.js";

vi.mock("../../../../src/database/psql.js", async () => (await import("../../../helpers/crowdDatabase.js")).databaseOfOpenTransaction());

const NETWORK = "99974";
const CELL_KEY = 24494 * 256 + 3;
const SUBJECT_KEY = observedCellSubject({ plmn: NETWORK, rat: "LTE", cellKey: CELL_KEY });
const observationFlagSelectSchema = createSelectSchema(observationFlags);

type Closing = Partial<Pick<z.infer<typeof observationFlagSelectSchema>, "closedReason" | "dismissedReason">>;

function missingCell(observedCellId: number, observedSiteId: number, people: number): RaisedFlag<"cellMissing"> {
  return {
    kind: "cellMissing",
    subjectKey: SUBJECT_KEY,
    refs: { observedCellId, observedSiteId },
    evidence: { samples: 64, people, lastSeenOn: "2026-10-20" },
    suggestion: { cells: [{ action: "create", rat: "lte", bandId: 3, tac: 52010, enbid: 24494, clid: 3, pci: 214, earfcn: 1850 }] },
    measure: { people },
  };
}

function syncMissing(tx: DbTx, raised: RaisedFlag[]) {
  return syncFlags(tx, { kinds: ["cellMissing"], lookedAt: inArray(observationFlags.subjectKey, [SUBJECT_KEY]), raised });
}

function flagsOf(tx: DbTx, subjectKeys: string[] = [SUBJECT_KEY]) {
  return tx
    .select({
      subjectKey: observationFlags.subjectKey,
      closedReason: observationFlags.closedReason,
      dismissedReason: observationFlags.dismissedReason,
      observedCellId: observationFlags.observedCellId,
    })
    .from(observationFlags)
    .where(inArray(observationFlags.subjectKey, subjectKeys))
    .orderBy(observationFlags.id);
}

function closedRow(values: Closing) {
  return { kind: "valueDiffers" as const, subjectKey: `test:${randomUUID()}`, evidence: {}, resolvedAt: sql`now()`, ...values };
}

describeOnCrowdDatabase("dismissals that outlive the crowd rows they name", () => {
  it("keeps a dismissed flag when its observed cell is withdrawn, and raises it again for the cell made anew only once more people see it", () =>
    rolledBack(async (tx) => {
      const siteId = await addObservedSite(tx, NETWORK, 24494);
      const firstId = await addObservedCell(tx, { plmn: NETWORK, cellKey: CELL_KEY, observedSiteId: siteId });
      await syncMissing(tx, [missingCell(firstId, siteId, 2)]);
      await tx
        .update(observationFlags)
        .set({ ...closedFlagValues("dismissed", null), dismissedReason: "cannotVerify" })
        .where(eq(observationFlags.subjectKey, SUBJECT_KEY));

      await tx.delete(observedCells).where(eq(observedCells.id, firstId));
      expect(await flagsOf(tx)).toEqual([
        { subjectKey: SUBJECT_KEY, closedReason: "dismissed", dismissedReason: "cannotVerify", observedCellId: null },
      ]);

      const againId = await addObservedCell(tx, { plmn: NETWORK, cellKey: CELL_KEY, observedSiteId: siteId });
      expect(await syncMissing(tx, [missingCell(againId, siteId, 2)])).toEqual({ opened: 0, updated: 0, resolved: 0 });
      expect(await syncMissing(tx, [missingCell(againId, siteId, 3)])).toEqual({ opened: 1, updated: 0, resolved: 0 });
    }));

  it("resolves an open flag whose observed cell went away as evidenceGone at the next sweep", () =>
    rolledBack(async (tx) => {
      const siteId = await addObservedSite(tx, NETWORK, 24494);
      const cellId = await addObservedCell(tx, { plmn: NETWORK, cellKey: CELL_KEY, observedSiteId: siteId });
      await syncMissing(tx, [missingCell(cellId, siteId, 2)]);

      await tx.delete(observedCells).where(eq(observedCells.id, cellId));
      await passFlagsOfGoneObservations();

      expect(await flagsOf(tx)).toMatchObject([{ closedReason: "evidenceGone", observedCellId: null }]);
    }));

  it("closes a stale flag the pass names as settled by the database as fixedElsewhere, and the others as evidenceGone", () =>
    rolledBack(async (tx) => {
      const [fixedKey, goneKey] = [`test:${randomUUID()}`, `test:${randomUUID()}`];
      const raised = (subjectKey: string): RaisedFlag<"valueDiffers"> => ({
        kind: "valueDiffers",
        subjectKey,
        refs: {},
        evidence: { field: "pci", observed: 301, stored: 214, samples: 46, people: 2, lastSeenOn: "2026-10-30" },
        suggestion: { cells: [{ action: "update", id: 1, pci: 301 }] },
        measure: { value: 301, people: 2 },
      });
      const lookedAt = inArray(observationFlags.subjectKey, [fixedKey, goneKey]);
      await syncFlags(tx, { kinds: ["valueDiffers"], lookedAt, raised: [raised(fixedKey), raised(goneKey)] });

      const counts = await syncFlags(tx, {
        kinds: ["valueDiffers"],
        lookedAt,
        raised: [],
        fixed: flagsIn([{ kind: "valueDiffers", subjectKey: fixedKey }]),
      });

      expect(counts).toEqual({ opened: 0, updated: 0, resolved: 2 });
      expect(await flagsOf(tx, [fixedKey, goneKey])).toMatchObject([
        { subjectKey: fixedKey, closedReason: "fixedElsewhere" },
        { subjectKey: goneKey, closedReason: "evidenceGone" },
      ]);
    }));

  it.each([
    ["a dismissed flag without the editor's reason", { closedReason: "dismissed" as const }],
    ["a resolved flag with a dismissal reason", { closedReason: "fixedElsewhere" as const, dismissedReason: "notAnIssue" as const }],
    ["a closed flag without a reason", {}],
  ])("refuses %s", (_case, values) =>
    rolledBack(async (tx) => {
      await expect(tx.transaction((savepoint) => savepoint.insert(observationFlags).values(closedRow(values)))).rejects.toThrow();
      await tx.insert(observationFlags).values(closedRow({ closedReason: "dismissed", dismissedReason: "needsSurvey" }));
    }),
  );
});

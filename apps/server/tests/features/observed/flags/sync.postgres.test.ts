import { observationFlags } from "@openbts/drizzle";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

import type { RaisedFlag } from "../../../../src/features/observed/flags/kinds.js";
import { syncFlags } from "../../../../src/features/observed/flags/sync.js";
import type { DbTx } from "../../../../src/types/global.js";
import { describeOnCrowdDatabase, rolledBack } from "../../../helpers/crowdDatabase.js";

function raisedPci(subjectKey: string, samples: number): RaisedFlag<"valueDiffers"> {
  return {
    kind: "valueDiffers",
    subjectKey,
    refs: {},
    evidence: { field: "pci", observed: 301, stored: 214, samples, people: 2, lastSeenOn: "2026-10-30" },
    suggestion: { cells: [{ action: "update", id: 880345, pci: 301 }] },
    measure: { value: 301, people: 2 },
  };
}

function syncSubject(tx: DbTx, subjectKey: string, raised: RaisedFlag[]) {
  return syncFlags(tx, { kinds: ["valueDiffers"], lookedAt: inArray(observationFlags.subjectKey, [subjectKey]), raised });
}

function flagsOf(tx: DbTx, subjectKey: string) {
  return tx
    .select({
      id: observationFlags.id,
      closedReason: observationFlags.closedReason,
      evidence: observationFlags.evidence,
      suggestion: observationFlags.suggestion,
    })
    .from(observationFlags)
    .where(eq(observationFlags.subjectKey, subjectKey))
    .orderBy(observationFlags.id);
}

describeOnCrowdDatabase("syncFlags", () => {
  it("updates the open flag of a subject in place, keeping its id, and leaves it alone while its evidence stays the same", () =>
    rolledBack(async (tx) => {
      const subjectKey = `test:${randomUUID()}`;

      expect(await syncSubject(tx, subjectKey, [raisedPci(subjectKey, 46)])).toEqual({ opened: 1, updated: 0, resolved: 0 });
      const [opened] = await flagsOf(tx, subjectKey);
      expect(await syncSubject(tx, subjectKey, [raisedPci(subjectKey, 80)])).toEqual({ opened: 0, updated: 1, resolved: 0 });
      expect(await syncSubject(tx, subjectKey, [raisedPci(subjectKey, 80)])).toEqual({ opened: 0, updated: 0, resolved: 0 });

      expect(await flagsOf(tx, subjectKey)).toEqual([
        {
          id: opened?.id,
          closedReason: null,
          evidence: expect.objectContaining({ samples: 80 }),
          suggestion: { cells: [{ action: "update", id: 880345, pci: 301 }] },
        },
      ]);
    }));

  it("resolves an open flag that is no longer raised without its suggestion, and opens a new one when it comes back", () =>
    rolledBack(async (tx) => {
      const subjectKey = `test:${randomUUID()}`;
      await syncSubject(tx, subjectKey, [raisedPci(subjectKey, 46)]);

      expect(await syncSubject(tx, subjectKey, [])).toEqual({ opened: 0, updated: 0, resolved: 1 });
      expect(await syncSubject(tx, subjectKey, [raisedPci(subjectKey, 46)])).toEqual({ opened: 1, updated: 0, resolved: 0 });

      const [resolved, reopened] = await flagsOf(tx, subjectKey);
      expect(resolved).toMatchObject({ closedReason: "evidenceGone", suggestion: null });
      expect(reopened).toMatchObject({ closedReason: null, suggestion: { cells: [{ action: "update", id: 880345, pci: 301 }] } });
    }));
});

import { describe, expect, it } from "vitest";

import type { RaisedFlag } from "../../../../src/features/observed/flags/kinds.js";
import { flagsIn, syncFlags } from "../../../../src/features/observed/flags/sync.js";
import type { DbTx } from "../../../../src/types/global.js";
import { logger } from "../../../../src/utils/logger.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { EDITOR_ID } from "../../../helpers/flagFixtures.js";

const tx = dbMock as unknown as DbTx;
const SUBJECT_KEY = "cell:880345:pci";

function raisedPci(observed = 301, samples = 46, people = 2): RaisedFlag<"valueDiffers"> {
  return {
    kind: "valueDiffers",
    subjectKey: SUBJECT_KEY,
    refs: { stationId: 40077, cellId: 880345, observedCellId: 50411, observedSiteId: 9205 },
    evidence: { field: "pci", observed, stored: 214, samples, people, lastSeenOn: "2026-10-30" },
    suggestion: { cells: [{ action: "update", id: 880345, pci: observed }] },
    measure: { value: observed, people },
  };
}

function sync(raised: RaisedFlag[], resolvedById?: string) {
  return syncFlags(tx, { kinds: ["valueDiffers", "valueMissing"], lookedAt: undefined, raised, resolvedById });
}

const OPEN_PCI = { id: 4101, kind: "valueDiffers", subjectKey: SUBJECT_KEY };

function writesTo(operation: string) {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === "observation_flags");
}

describe("syncing a pass's flags", () => {
  it.each([
    ["nobody, when a timer's pass", undefined, null],
    ["the editor, when their route refreshed it", EDITOR_ID, EDITOR_ID],
  ])("resolves an open flag that is no longer raised, by %s, and drops its suggestion", async (_title, resolvedById, resolver) => {
    dbMock.enqueueFor("select", "observation_flags", [OPEN_PCI]);
    dbMock.enqueueFor("update", "observation_flags", []);

    const counts = await sync([], resolvedById);

    expect(counts).toEqual({ opened: 0, updated: 0, resolved: 1 });
    expect(writesTo("update").map((call) => call.values)).toMatchObject([{ closedReason: "evidenceGone", resolvedById: resolver, suggestion: null }]);
    expect(writesTo("insert")).toEqual([]);
  });

  it("says a flag the pass's rule finds settled by the database was fixed elsewhere", async () => {
    dbMock.enqueueFor("select", "observation_flags", [OPEN_PCI], [{ id: 4101 }]);
    dbMock.enqueueFor("update", "observation_flags", []);

    await syncFlags(tx, { kinds: ["valueDiffers"], raised: [], fixed: flagsIn([{ kind: "valueDiffers", subjectKey: SUBJECT_KEY }]) });

    expect(writesTo("update").map((call) => call.values)).toMatchObject([{ closedReason: "fixedElsewhere" }]);
  });

  it("opens a new flag at once when the latest one of its subject was resolved", async () => {
    dbMock.enqueueFor(
      "select",
      "observation_flags",
      [],
      [{ kind: "valueDiffers", subjectKey: SUBJECT_KEY, closedReason: "evidenceGone", measure: raisedPci().measure }],
    );
    dbMock.enqueueFor("insert", "observation_flags", [{ kind: "valueDiffers", subjectKey: SUBJECT_KEY }]);

    expect(await sync([raisedPci()])).toEqual({ opened: 1, updated: 0, resolved: 0 });
  });

  it.each([
    ["the same value with ten times the samples", 0, raisedPci(301, 460)],
    ["the same value from more people", 1, raisedPci(301, 50, 3)],
    ["another value", 1, raisedPci(302, 10)],
  ])("after a dismissal, raising %s opens %i new flags", async (_title, opened, raised) => {
    const dismissed = { kind: "valueDiffers", subjectKey: SUBJECT_KEY, closedReason: "dismissed", measure: raisedPci(301, 46).measure };
    dbMock.enqueueFor("select", "observation_flags", [], [dismissed]);
    dbMock.enqueueFor("insert", "observation_flags", []);

    await sync([raised]);

    expect(writesTo("insert")).toHaveLength(opened);
  });

  it("keeps a dismissal whose stored baseline no longer reads, and says so in the log", async () => {
    const dismissed = { kind: "valueDiffers", subjectKey: SUBJECT_KEY, closedReason: "dismissed", measure: { pci: 301 } };
    dbMock.enqueueFor("select", "observation_flags", [], [dismissed]);

    expect(await sync([raisedPci(302, 500)])).toEqual({ opened: 0, updated: 0, resolved: 0 });
    expect(writesTo("insert")).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("observations.flags.unreadable_baseline", expect.objectContaining({ kind: "valueDiffers" }));
  });
});

import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { applyRevertPlan } from "../../../src/features/audit/revert/apply.js";
import { planCellRevert } from "../../../src/features/audit/revert/strategies/cells.js";
import { planStationRevert } from "../../../src/features/audit/revert/strategies/stations.js";
import type { StrategyContext } from "../../../src/features/audit/revert/types.js";
import type { AuditEntry, AuditRecorder } from "../../../src/features/audit/types.js";
import type { DbTx } from "../../../src/types/global.js";
import { type DatabaseCall, dbMock } from "../../helpers/boundaries.js";
import { cellInputs, radioTables, storedCell } from "../../helpers/cellWriteFixtures.js";
import { readDate } from "../../helpers/readFixtures.js";
import { stationRow } from "../../helpers/stationFixtures.js";

function auditEntry(input: Pick<AuditEntry, "id" | "entity" | "op" | "record_id" | "old_values" | "new_values">): AuditEntry {
  return { operation_id: 7, station_id: 1, metadata: null, createdAt: readDate, ...input };
}

function flatCell({ cell, gsm, umts, lte, nr }: ReturnType<typeof storedCell>) {
  return { ...cell, gsm, umts, lte, nr };
}

function restoresPlacement({ operation, table, values }: DatabaseCall): boolean {
  return (
    operation === "update" &&
    table === "stations" &&
    typeof values === "object" &&
    values !== null &&
    "location_id" in values &&
    values.location_id === 1
  );
}

function readsCountryFeatures({ operation, table, selection }: DatabaseCall): boolean {
  return (
    operation === "select" && table === "stations" && typeof selection === "object" && selection !== null && "psc" in selection && "bsic" in selection
  );
}

describe("applyRevertPlan country features", () => {
  it.each([
    { rat: "gsm", field: "bsic", enabled: true },
    { rat: "umts", field: "psc", enabled: true },
    { rat: "gsm", field: "bsic", enabled: false },
    { rat: "umts", field: "psc", enabled: false },
  ] as const)("uses the restored country's $field policy for deleted and updated $rat cells (enabled: $enabled)", async ({ rat, field, enabled }) => {
    const originalInput = rat === "gsm" ? { ...cellInputs.gsm, bsic: 7 } : { ...cellInputs.umts, psc: 7 };
    const currentInput = rat === "gsm" ? { ...cellInputs.gsm, bsic: 19 } : { ...cellInputs.umts, psc: 19 };
    const deleted = storedCell(originalInput, 11);
    const updatedBefore = storedCell(originalInput, 12);
    const updatedCurrent = storedCell(currentInput, 12);
    const updatedAfter = enabled ? updatedBefore : updatedCurrent;
    const currentStation = stationRow({ id: 1, location_id: 2 });
    const restoredStation = stationRow({ id: 1, location_id: 1 });
    const entries = [
      auditEntry({ id: 101, entity: "stations", op: "update", record_id: "1", old_values: restoredStation, new_values: currentStation }),
      auditEntry({
        id: 102,
        entity: "cells",
        op: "delete",
        record_id: "11",
        old_values: { ...deleted.cell, details: deleted.radio },
        new_values: null,
      }),
      auditEntry({
        id: 103,
        entity: "cells",
        op: "update",
        record_id: "12",
        old_values: { ...updatedBefore.cell, details: updatedBefore.radio },
        new_values: { ...updatedCurrent.cell, details: updatedCurrent.radio },
      }),
    ];
    const tx = dbMock as unknown as DbTx;
    const context: StrategyContext = { tx, pendingInserts: new Map(), selectedEntries: entries, operationEntries: entries };
    const audit: AuditRecorder = {
      operationId: 8,
      tx,
      entryMetadata: null,
      log: vi.fn(async () => undefined),
      logMany: vi.fn(async () => undefined),
      withEntryMetadata: () => audit,
    };
    dbMock.enqueueFor("select", "stations", [currentStation], [{ id: 1 }], [restoredStation]);
    dbMock.query.locations.findFirst.mockResolvedValue({ id: 1 });
    dbMock.query.cells.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([flatCell(updatedCurrent)])
      .mockResolvedValueOnce([flatCell(updatedAfter)])
      .mockResolvedValueOnce([flatCell(deleted)]);
    dbMock.enqueueFor("select", "bands", [{ id: originalInput.bandId }]);
    dbMock.enqueueFor("insert", "cells", []);
    dbMock.enqueueFor("insert", getTableName(radioTables[rat]), [deleted.radio]);
    dbMock.enqueueFor("update", getTableName(radioTables[rat]), [updatedAfter.radio]);
    dbMock.enqueueFor("update", "stations", [], []);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "cells", [], [], []);
    function finalCountryEnabled(): boolean {
      return dbMock.calls.some(restoresPlacement) ? enabled : !enabled;
    }
    dbMock.enqueueCountryFeatures("stations", [
      {
        stationId: 1,
        structureOwnerProposals: false,
        get psc() {
          return finalCountryEnabled();
        },
        get bsic() {
          return finalCountryEnabled();
        },
      },
    ]);

    const plans = [
      await planStationRevert(context, entries[0]!),
      await planCellRevert(context, entries[1]!),
      await planCellRevert(context, entries[2]!),
    ];
    expect(plans.flatMap(({ conflicts }) => conflicts)).toEqual([]);
    await applyRevertPlan(tx, audit, plans, false);

    const radioTable = getTableName(radioTables[rat]);
    const inserted = dbMock.calls.find(({ operation, table }) => operation === "insert" && table === radioTable);
    const updated = dbMock.calls.find(({ operation, table }) => operation === "update" && table === radioTable);
    expect(inserted?.values).toMatchObject({ [field]: enabled ? 7 : undefined });
    expect(updated?.values).toMatchObject({ [field]: enabled ? 7 : undefined });
    expect(updatedCurrent.radio).toMatchObject({ [field]: 19 });
    expect(dbMock.calls.filter(readsCountryFeatures)).toHaveLength(1);
    const placementIndex = dbMock.calls.findIndex(restoresPlacement);
    const parentIndex = dbMock.calls.findIndex(({ operation, table }) => operation === "insert" && table === "cells");
    expect(parentIndex).toBeLessThan(placementIndex);
    expect(dbMock.calls.findIndex(readsCountryFeatures)).toBeGreaterThan(placementIndex);
  });
});

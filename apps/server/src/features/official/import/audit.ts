import type { SourceAudit } from "@openbts/country-packs/sources";
import { auditLogs, auditOperations } from "@openbts/drizzle";

import { chunks } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { stampOperationCountry } from "../../audit/country.js";
import { STATEMENT_BATCH_SIZE } from "./config.js";

export function sourceAuditOn(tx: DbTx, onRecorded: (entryCount: number) => void): SourceAudit {
  return async (operation, entries) => {
    if (entries.length === 0) return;

    const [recorded] = await tx
      .insert(auditOperations)
      .values({ kind: operation.kind, source: "import", metadata: operation.metadata })
      .returning({ id: auditOperations.id });
    if (!recorded) throw new Error("Failed to record the import audit operation");

    for (const group of chunks(entries, STATEMENT_BATCH_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      await tx.insert(auditLogs).values(
        group.map((entry) => ({
          operation_id: recorded.id,
          entity: entry.entity,
          op: entry.op,
          record_id: String(entry.recordId),
          station_id: entry.stationId,
          old_values: entry.old ?? null,
          new_values: entry.new ?? null,
        })),
      );
    }
    await stampOperationCountry(tx, recorded.id);
    onRecorded(entries.length);
  };
}

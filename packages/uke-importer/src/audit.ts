import { auditLogs, auditOperations } from "@openbts/drizzle";
import type { AuditEntity } from "@openbts/shared/audit";

import { DATABASE_STATEMENT_BATCH_SIZE } from "./database-batching.js";
import type { db } from "./database.js";
import { chunk } from "./utils.js";

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ImportAuditEntry = {
  entity: AuditEntity;
  op: "create" | "update" | "delete";
  recordId: number;
  stationId: number;
  old?: unknown;
  new?: unknown;
};

export async function recordImportAudit(tx: DbTx, metadata: Record<string, unknown>, entries: ImportAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const [operation] = await tx
    .insert(auditOperations)
    .values({ kind: "uke.import", source: "import", metadata })
    .returning({ id: auditOperations.id });
  if (!operation) throw new Error("Failed to record the import audit operation");

  for (const group of chunk(entries, DATABASE_STATEMENT_BATCH_SIZE)) {
    // oxlint-disable-next-line no-await-in-loop -- audit batches share the import transaction's connection
    await tx.insert(auditLogs).values(
      group.map((entry) => ({
        operation_id: operation.id,
        entity: entry.entity,
        op: entry.op,
        record_id: String(entry.recordId),
        station_id: entry.stationId,
        old_values: entry.old ?? null,
        new_values: entry.new ?? null,
      })),
    );
  }
}

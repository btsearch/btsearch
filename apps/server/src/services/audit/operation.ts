import { auditLogs, auditOperations } from "@openbts/drizzle";
import type { AuditOperationKind } from "@openbts/shared/audit";
import { eq, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { AuditContext } from "./context.js";
import type { AuditEntryInput, AuditOperationSpec, AuditRecorder } from "./types.js";

type EnsuredOperation = { id: number; created: boolean };

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]));
}

function operationActorId(context: AuditContext, spec: AuditOperationSpec): string | null {
  return spec.actorId === undefined ? context.actorId : spec.actorId;
}

function operationKind(context: AuditContext, spec: AuditOperationSpec): AuditOperationKind {
  return context.clientKind ?? spec.kind;
}

function hasPartialReverts(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const partialReverts = (value as Record<string, unknown>).partial_reverts;
  return Array.isArray(partialReverts) && partialReverts.length > 0;
}

function assertReusableOperation(existing: typeof auditOperations.$inferSelect, context: AuditContext, spec: AuditOperationSpec): void {
  if (existing.performed_by !== context.performedBy) throw new ErrorResponse("FORBIDDEN");
  if (existing.actor_id !== operationActorId(context, spec)) throw new ErrorResponse("FORBIDDEN");
  if (existing.source !== context.source) throw new ErrorResponse("FORBIDDEN");
  if (existing.kind !== operationKind(context, spec))
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation kind does not match the existing operation" });
  if (existing.reverts_operation_id !== (spec.revertsOperationId ?? null))
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation target does not match the existing operation" });
  if (existing.reverted_by_operation_id !== null || hasPartialReverts(existing.metadata))
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation correlation key belongs to an operation that is already being reverted" });
  if (existing.createdAt.getTime() <= Date.now() - 60 * 60 * 1000)
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation correlation key has expired" });
}

async function ensureOperation(tx: DbTx, context: AuditContext, spec: AuditOperationSpec): Promise<EnsuredOperation> {
  if (context.clientKey !== null) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${context.clientKey}, 0))`);
    const [existing] = await tx.select().from(auditOperations).where(eq(auditOperations.client_key, context.clientKey)).for("update").limit(1);
    if (existing !== undefined) {
      assertReusableOperation(existing, context, spec);
      // The no-op update gives repeatable-read reverts a row-version conflict if they started while this writer held the lock.
      const [touched] = await tx
        .update(auditOperations)
        .set({ metadata: existing.metadata })
        .where(eq(auditOperations.id, existing.id))
        .returning({ id: auditOperations.id });
      if (touched === undefined) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: "Failed to lock the audit operation" });
      return { id: existing.id, created: false };
    }
  }

  const [created] = await tx
    .insert(auditOperations)
    .values({
      client_key: context.clientKey,
      kind: operationKind(context, spec),
      actor_id: operationActorId(context, spec),
      performed_by: context.performedBy,
      source: context.source,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      metadata: spec.metadata ?? null,
      reverts_operation_id: spec.revertsOperationId ?? null,
    })
    .returning({ id: auditOperations.id });
  if (created === undefined) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: "Failed to create audit operation" });
  return { id: created.id, created: true };
}

class TransactionAuditRecorder implements AuditRecorder {
  readonly operationId: number;
  readonly tx: DbTx;
  entriesLogged = 0;
  #active = true;

  constructor(tx: DbTx, operationId: number) {
    this.tx = tx;
    this.operationId = operationId;
  }

  async log(entry: AuditEntryInput): Promise<void> {
    await this.logMany([entry]);
  }

  async logMany(entries: readonly AuditEntryInput[]): Promise<void> {
    if (!this.#active) throw new Error("Audit recorder cannot be used after its transaction callback returns");
    if (entries.length === 0) return;

    await this.tx.insert(auditLogs).values(
      entries.map((entry) => ({
        operation_id: this.operationId,
        entity: entry.entity,
        op: entry.op,
        record_id: entry.recordId === null ? null : String(entry.recordId),
        station_id: entry.stationId ?? null,
        old_values: jsonSafe(entry.old ?? null),
        new_values: jsonSafe(entry.new ?? null),
        metadata: jsonSafe(entry.metadata ?? null),
      })),
    );
    this.entriesLogged += entries.length;
  }

  close(): void {
    this.#active = false;
  }
}

export async function runAuditedOperation<T>(
  context: AuditContext,
  spec: AuditOperationSpec,
  callback: (tx: DbTx, audit: AuditRecorder) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const operation = await ensureOperation(tx, context, spec);
    const recorder = new TransactionAuditRecorder(tx, operation.id);
    let result: T;
    try {
      result = await callback(tx, recorder);
    } finally {
      recorder.close();
    }

    if (operation.created && recorder.entriesLogged === 0 && spec.allowEmpty !== true)
      await tx.delete(auditOperations).where(eq(auditOperations.id, operation.id));
    return result;
  }, spec.transactionConfig);
}

export async function recordAuditOperation(context: AuditContext, spec: Omit<AuditOperationSpec, "allowEmpty">): Promise<number> {
  return runAuditedOperation(context, { ...spec, allowEmpty: true }, async (_tx, audit) => audit.operationId);
}

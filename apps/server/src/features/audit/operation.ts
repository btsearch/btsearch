import { auditLogs, auditOperations } from "@openbts/drizzle";
import type { AuditOperationKind, AuditSource } from "@openbts/shared/audit";
import { eq, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { AuditContext } from "./context.js";
import { stampOperationCountry } from "./country.js";
import { hasOperationFamily, leadingKind } from "./families.js";
import { toAuditMetadata } from "./metadata.js";
import type { AuditEntryInput, AuditMetadata, AuditOperationSpec, AuditRecorder } from "./types.js";

type StoredOperation = {
  id: number;
  kind: AuditOperationKind;
  actor_id: string | null;
  performed_by: string | null;
  source: AuditSource;
  metadata: unknown;
  reverts_operation_id: number | null;
  reverted_by_operation_id: number | null;
  createdAt: Date;
};
type EnsuredOperation = { id: number; created: boolean; joined: StoredOperation | null };

const CLIENT_KEY_LIFETIME_MS = 60 * 60 * 1000;

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

function joinsByFamily(context: AuditContext): boolean {
  return context.clientKey !== null && context.clientKind === null;
}

function operationClientKey(context: AuditContext, spec: AuditOperationSpec): string | null {
  if (!joinsByFamily(context)) return context.clientKey;
  return (spec.revertsOperationId ?? null) === null && hasOperationFamily(spec.kind) ? context.clientKey : null;
}

function hasPartialReverts(value: unknown): boolean {
  const partialReverts = toAuditMetadata(value)?.partial_reverts;
  return Array.isArray(partialReverts) && partialReverts.length > 0;
}

function uniteMetadata(stored: AuditMetadata | null, sent: AuditMetadata | null, sentLeads: boolean): AuditMetadata | null {
  if (stored === null || sent === null) return stored ?? sent;

  const united: AuditMetadata = sentLeads ? { ...stored, ...sent } : { ...sent, ...stored };
  for (const [key, sentValue] of Object.entries(sent)) {
    const storedValue = stored[key];
    if (Array.isArray(storedValue) && Array.isArray(sentValue)) united[key] = [...new Set([...storedValue, ...sentValue])];
  }
  return united;
}

function assertReusableOperation(existing: StoredOperation, context: AuditContext, spec: AuditOperationSpec): void {
  if (existing.performed_by !== context.performedBy) throw new ErrorResponse("FORBIDDEN");
  if (existing.actor_id !== operationActorId(context, spec)) throw new ErrorResponse("FORBIDDEN");
  if (existing.source !== context.source) throw new ErrorResponse("FORBIDDEN");
  if (existing.kind !== operationKind(context, spec))
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation kind does not match the existing operation" });
  if (existing.reverts_operation_id !== (spec.revertsOperationId ?? null))
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation target does not match the existing operation" });
  if (existing.reverted_by_operation_id !== null || hasPartialReverts(existing.metadata))
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation correlation key belongs to an operation that is already being reverted" });
  if (existing.createdAt.getTime() <= Date.now() - CLIENT_KEY_LIFETIME_MS)
    throw new ErrorResponse("BAD_REQUEST", { message: "Audit operation correlation key has expired" });
}

function canJoinOperation(existing: StoredOperation, context: AuditContext, spec: AuditOperationSpec): boolean {
  if (existing.performed_by === null || existing.performed_by !== context.performedBy) return false;
  if (existing.source !== context.source) return false;
  if (leadingKind(existing.kind, spec.kind) === null) return false;
  if (existing.reverts_operation_id !== null || existing.reverted_by_operation_id !== null || hasPartialReverts(existing.metadata)) return false;
  return existing.createdAt.getTime() > Date.now() - CLIENT_KEY_LIFETIME_MS;
}

async function createOperation(tx: DbTx, context: AuditContext, spec: AuditOperationSpec, clientKey: string | null): Promise<EnsuredOperation> {
  const [created] = await tx
    .insert(auditOperations)
    .values({
      client_key: clientKey,
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
  return { id: created.id, created: true, joined: null };
}

async function ensureOperation(tx: DbTx, context: AuditContext, spec: AuditOperationSpec): Promise<EnsuredOperation> {
  const clientKey = operationClientKey(context, spec);
  if (clientKey === null) return createOperation(tx, context, spec, null);

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${clientKey}, 0))`);
  const [existing] = await tx.select().from(auditOperations).where(eq(auditOperations.client_key, clientKey)).for("update").limit(1);
  if (existing === undefined) return createOperation(tx, context, spec, clientKey);

  const isFamilyJoin = joinsByFamily(context);
  if (isFamilyJoin && !canJoinOperation(existing, context, spec)) return createOperation(tx, context, spec, null);
  if (!isFamilyJoin) assertReusableOperation(existing, context, spec);

  // The no-op update gives repeatable-read reverts a row-version conflict if they started while this writer held the lock.
  const [touched] = await tx
    .update(auditOperations)
    .set({ metadata: existing.metadata })
    .where(eq(auditOperations.id, existing.id))
    .returning({ id: auditOperations.id });
  if (touched === undefined) throw new ErrorResponse("INTERNAL_SERVER_ERROR", { message: "Failed to lock the audit operation" });
  return { id: existing.id, created: false, joined: isFamilyJoin ? existing : null };
}

async function leadJoinedOperation(tx: DbTx, existing: StoredOperation, context: AuditContext, spec: AuditOperationSpec): Promise<void> {
  const kind = leadingKind(existing.kind, spec.kind) ?? existing.kind;
  const takesLead = kind !== existing.kind;
  await tx
    .update(auditOperations)
    .set({
      kind,
      actor_id: takesLead ? operationActorId(context, spec) : existing.actor_id,
      metadata: uniteMetadata(toAuditMetadata(existing.metadata), spec.metadata ?? null, takesLead),
    })
    .where(eq(auditOperations.id, existing.id));
}

class TransactionAuditRecorder implements AuditRecorder {
  readonly operationId: number;
  readonly tx: DbTx;
  readonly entryMetadata = null;
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

  withEntryMetadata(metadata: AuditMetadata): AuditRecorder {
    return {
      operationId: this.operationId,
      tx: this.tx,
      entryMetadata: metadata,
      log: (entry) => this.log(entry),
      logMany: (entries) => this.logMany(entries),
      withEntryMetadata: (next) => this.withEntryMetadata(next),
    };
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

    if (recorder.entriesLogged === 0) {
      if (operation.created && spec.allowEmpty !== true) await tx.delete(auditOperations).where(eq(auditOperations.id, operation.id));
      return result;
    }

    if (operation.joined !== null) await leadJoinedOperation(tx, operation.joined, context, spec);
    await stampOperationCountry(tx, operation.id);
    return result;
  }, spec.transactionConfig);
}

export async function recordAuditOperation(context: AuditContext, spec: Omit<AuditOperationSpec, "allowEmpty">): Promise<number> {
  return runAuditedOperation(context, { ...spec, allowEmpty: true }, async (_tx, audit) => audit.operationId);
}

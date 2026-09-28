import type { AuditEntity, AuditOp, AuditOperationKind, AuditSource } from "@openbts/shared/audit";

import type { Database } from "../../database/psql.js";
import type { DbTx } from "../../types/global.js";

export type AuditMetadata = Record<string, unknown>;

export type AuditEntryInput = {
  entity: AuditEntity;
  op: AuditOp;
  recordId: string | number | null;
  stationId?: number | null;
  old?: unknown;
  new?: unknown;
  metadata?: AuditMetadata | null;
};

export type AuditRecorder = {
  operationId: number;
  tx: DbTx;
  log: (entry: AuditEntryInput) => Promise<void>;
  logMany: (entries: readonly AuditEntryInput[]) => Promise<void>;
};

export type AuditOperationSpec = {
  kind: AuditOperationKind;
  actorId?: string | null;
  metadata?: AuditMetadata | null;
  revertsOperationId?: number | null;
  allowEmpty?: boolean;
  transactionConfig?: NonNullable<Parameters<Database["transaction"]>[1]>;
};

export type UserSummary = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
};

export type AuditCount = {
  entity: AuditEntity;
  op: AuditOp;
  count: number;
};

export type AuditOperationSummary = {
  id: number;
  kind: AuditOperationKind;
  source: AuditSource;
  client_key: string | null;
  createdAt: Date;
  actor: UserSummary | null;
  performer: UserSummary | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: AuditMetadata | null;
  reverts_operation_id: number | null;
  reverted_by_operation_id: number | null;
  entry_count: number;
  counts: AuditCount[];
  station_ids: number[];
};

export type AuditEntry = {
  id: number;
  operation_id: number;
  entity: AuditEntity;
  op: AuditOp;
  record_id: string | null;
  station_id: number | null;
  old_values: unknown;
  new_values: unknown;
  metadata: AuditMetadata | null;
  createdAt: Date;
};

export type AuditOperationRow = {
  id: number;
  kind: AuditOperationKind;
  actor_id: string | null;
  performed_by: string | null;
  source: AuditSource;
  client_key: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: AuditMetadata | null;
  reverts_operation_id: number | null;
  reverted_by_operation_id: number | null;
  createdAt: Date;
};

export type AuditOperationWithEntries = AuditOperationSummary & {
  entries: Array<AuditEntry & { revertible: boolean; revert_reason?: string }>;
  revertible: boolean;
  reverts: Pick<AuditOperationSummary, "id" | "kind" | "createdAt"> | null;
  reverted_by: Pick<AuditOperationSummary, "id" | "kind" | "createdAt"> | null;
};

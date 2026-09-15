import type { AuditEntity, AuditOp, AuditOperationKind, AuditSource } from "@openbts/shared/audit";

export type AuditUserSummary = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
};

export type AuditOperationCount = {
  entity: AuditEntity;
  op: AuditOp;
  count: number;
};

type AuditOperationReference = {
  id: number;
  kind: AuditOperationKind;
  createdAt: string;
};

export type AuditOperationSummary = {
  id: number;
  kind: AuditOperationKind;
  source: AuditSource;
  client_key: string | null;
  createdAt: string;
  actor: AuditUserSummary | null;
  performer: AuditUserSummary | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  reverts_operation_id: number | null;
  reverted_by_operation_id: number | null;
  entry_count: number;
  counts: AuditOperationCount[];
  station_ids: number[];
};

export type AuditSnapshot = Record<string, unknown> | unknown[] | null;

export type AuditEntry = {
  id: number;
  entity: AuditEntity;
  op: AuditOp;
  record_id: string | null;
  station_id: number | null;
  old_values: AuditSnapshot;
  new_values: AuditSnapshot;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  revertible: boolean;
  revert_reason?: string;
};

export type AuditOperationDetail = AuditOperationSummary & {
  entries: AuditEntry[];
  revertible: boolean;
  reverts: AuditOperationReference | null;
  reverted_by: AuditOperationReference | null;
};

export type AuditOperationFilters = {
  limit: number;
  offset: number;
  sort: "asc" | "desc";
  kinds?: AuditOperationKind[];
  entities?: AuditEntity[];
  ops?: AuditOp[];
  userIds?: string[];
  from?: string;
  to?: string;
  stationId?: number;
  q?: string;
};

type RevertConflictField = {
  field: string;
  expected: unknown;
  current: unknown;
};

export const REVERT_CONFLICT_KINDS = [
  "missing",
  "stale",
  "already_absent",
  "exists",
  "unique_violation",
  "fk_missing",
  "referenced",
  "station_without_cells",
  "concurrent_modification",
] as const;

type RevertConflictKind = (typeof REVERT_CONFLICT_KINDS)[number];

export type RevertConflict = {
  entry_id: number;
  entity: AuditEntity;
  op: AuditOp;
  record_id: string | null;
  station_id: number | null;
  kind: RevertConflictKind;
  message: string;
  fields?: RevertConflictField[];
  dependents?: { table: string; count: number }[];
  constraint?: string;
};

export type RevertAuditOperationResult = {
  operation: AuditOperationSummary;
  reverted: number[];
  skipped: { entry_id: number; reason: string; message?: string }[];
  skipped_fields: { entry_id: number; field: string; reason: "fk_missing" }[];
  affected_station_ids: number[];
};

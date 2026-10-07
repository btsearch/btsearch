import type { AuditEntry, AuditOperation, AuditOperationListQuery } from "@openbts/shared/contract";

export type {
  AuditEntry,
  AuditOperation,
  AuditOperationDetail,
  AuditOperationList,
  AuditRevert,
  AuditRevertConflict,
  AuditRevertResult,
  UserRef,
} from "@openbts/shared/contract";

export type AuditOperationCount = AuditOperation["counts"][number];
export type AuditOperationQuery = Partial<AuditOperationListQuery>;
export type AuditSnapshot = AuditEntry["oldValues"];

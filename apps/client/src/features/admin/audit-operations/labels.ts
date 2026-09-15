import type { AuditEntity, AuditOp, AuditOperationKind } from "@openbts/shared/audit";
import type { TFunction } from "i18next";

import type { AuditOperationCount } from "./types";

const REVERT_REASON_LABEL_KEYS = {
  unsupported_entity: "auditLogs.revert.reasons.unsupportedEntity",
  unsupported_op: "auditLogs.revert.reasons.unsupportedOperation",
  operation_reverted: "auditLogs.revert.alreadyReverted",
  already_reverted: "auditLogs.revert.reasons.alreadyReverted",
  missing_record_id: "auditLogs.revert.reasons.missingRecordId",
  missing_old_values: "auditLogs.revert.reasons.missingOldValues",
  missing_new_values: "auditLogs.revert.reasons.missingNewValues",
  missing_details: "auditLogs.revert.reasons.missingDetails",
  no_changes: "auditLogs.detail.noChanges",
} as const;

type RevertReason = keyof typeof REVERT_REASON_LABEL_KEYS;

function isRevertReason(reason: string): reason is RevertReason {
  return Object.hasOwn(REVERT_REASON_LABEL_KEYS, reason);
}

export function getKindLabel(t: TFunction, kind: AuditOperationKind): string {
  return t(`auditLogs.kinds.${kind}`, { ns: "admin", defaultValue: kind });
}

export function getEntityLabel(t: TFunction, entity: AuditEntity): string {
  return t(`auditLogs.entities.${entity}`, { ns: "admin", defaultValue: entity });
}

export function getOpLabel(t: TFunction, op: AuditOp): string {
  return t(`auditLogs.ops.${op}`, { ns: "admin", defaultValue: op });
}

export function getRevertReasonLabel(t: TFunction, reason: string | null | undefined): string {
  if (reason === null || reason === undefined || !isRevertReason(reason)) return t("auditLogs.revert.notRevertible", { ns: "admin" });
  return t(REVERT_REASON_LABEL_KEYS[reason], { ns: "admin" });
}

export function formatCountsSummary(t: TFunction, counts: AuditOperationCount[]): string {
  const totals = new Map<AuditEntity, number>();
  for (const { entity, count } of counts) totals.set(entity, (totals.get(entity) ?? 0) + count);

  return [...totals]
    .map(([entity, count]) =>
      t(`auditLogs.counts.${entity}`, {
        ns: "admin",
        count,
        defaultValue: t("auditLogs.counts.other", { ns: "admin", count, entity: getEntityLabel(t, entity) }),
      }),
    )
    .join(" · ");
}

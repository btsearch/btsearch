import type { AuditEntity, AuditOp, AuditOperationKind } from "@openbts/shared/audit";
import type { TFunction } from "i18next";

import type { AuditOperationCount } from "./types";

export function getKindLabel(t: TFunction, kind: AuditOperationKind): string {
  return t(`auditLogs.kinds.${kind}`, { ns: "admin", defaultValue: kind });
}

export function getEntityLabel(t: TFunction, entity: AuditEntity): string {
  return t(`auditLogs.entities.${entity}`, { ns: "admin", defaultValue: entity });
}

export function getOpLabel(t: TFunction, op: AuditOp): string {
  return t(`auditLogs.ops.${op}`, { ns: "admin", defaultValue: op });
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

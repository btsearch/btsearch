import type { AuditOperationSort } from "@openbts/shared/contract";
import { type SortingState, createColumnHelper } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { OperationActor } from "../components/operationActor";
import { OperationKindBadge } from "../components/operationKindBadge";
import { OperationTarget } from "../components/operationTarget";
import { formatAuditDate, formatCountsSummary, getOperationTargetLabel } from "../labels";
import type { AuditOperation } from "../types";
import { DataTableSortButton } from "@/components/ui/data-table-sort-button";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

const CREATED_COLUMN_ID = "createdAt";
const CLAMPED_CELL_CLASS = "line-clamp-2 text-xs leading-4 wrap-anywhere";

const columnHelper = createColumnHelper<AppTableFeatures, AuditOperation>();

export const AUDIT_LOGS_SORTING: Record<AuditOperationSort, SortingState> = {
  createdAt: [{ id: CREATED_COLUMN_ID, desc: false }],
  "-createdAt": [{ id: CREATED_COLUMN_ID, desc: true }],
};

export function useAuditLogsColumns(sort: AuditOperationSort, onSortChange: (sort: AuditOperationSort) => void) {
  const { t, i18n } = useTranslation(["admin", "common"]);

  return columnHelper.columns([
    columnHelper.accessor(CREATED_COLUMN_ID, {
      header: () => (
        <DataTableSortButton
          label={t("auditLogs.columns.timestamp")}
          isActive
          isAscending={sort === "createdAt"}
          onClick={() => onSortChange(sort === "-createdAt" ? "createdAt" : "-createdAt")}
        />
      ),
      size: 160,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground tabular-nums text-xs font-mono">{formatAuditDate(getValue(), i18n.language)}</span>
      ),
    }),
    columnHelper.accessor("actor", {
      header: t("auditLogs.columns.actor"),
      size: 180,
      cell: ({ row }) => <OperationActor operation={row.original} linked />,
    }),
    columnHelper.accessor("kind", {
      header: t("auditLogs.columns.kind"),
      size: 200,
      cell: ({ getValue }) => <OperationKindBadge kind={getValue()} t={t} />,
    }),
    columnHelper.display({
      id: "target",
      header: t("auditLogs.columns.target"),
      size: 130,
      cell: ({ row }) => {
        const targetLabel = getOperationTargetLabel(t, row.original);
        return (
          <div title={targetLabel} className={CLAMPED_CELL_CLASS}>
            <OperationTarget operation={row.original} targetLabel={targetLabel} />
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "changes",
      header: t("common:labels.changes"),
      size: 180,
      cell: ({ row }) => {
        const changesSummary = formatCountsSummary(t, row.original.counts);
        return (
          <p title={changesSummary} className={cn(CLAMPED_CELL_CLASS, "text-muted-foreground")}>
            {changesSummary}
          </p>
        );
      },
    }),
    columnHelper.accessor("source", {
      header: t("common:labels.source"),
      size: 80,
      cell: ({ getValue }) => <span className="text-xs text-muted-foreground uppercase">{getValue()}</span>,
    }),
  ]);
}

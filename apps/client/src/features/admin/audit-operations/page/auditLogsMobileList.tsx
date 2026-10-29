import { Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AuditOperationSort } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { OperationActor } from "../components/operationActor";
import { OperationKindBadge } from "../components/operationKindBadge";
import { OperationTarget } from "../components/operationTarget";
import { describeOperation, formatAuditDate, formatCountsSummary, getOperationTargetLabel } from "../labels";
import type { AuditOperation } from "../types";
import type { DataTableViewState } from "@/components/ui/data-table";
import { SORT_ASCENDING_ICON_STYLE } from "@/components/ui/data-table-sort-button";
import { Skeleton } from "@/components/ui/skeleton";
import { type RecordListEmptyState, RecordListMobileList } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { cn } from "@/lib/utils";

type AuditOperationMobileRowProps = {
  operation: AuditOperation;
  onOpenOperation: (operationId: number) => void;
};

type AuditLogsMobileListProps = {
  operations: AuditOperation[];
  viewState: DataTableViewState;
  pageSize: number;
  fillHeight: number;
  sort: AuditOperationSort;
  emptyState: RecordListEmptyState;
  isRetrying: boolean;
  listRef: (node: HTMLUListElement | null) => void;
  onSortChange: (sort: AuditOperationSort) => void;
  onOpenOperation: (operationId: number) => void;
  onRetry: () => unknown;
};

const MAX_SKELETON_ROWS = 6;
const SORT_BUTTON_CLASS = cn(
  "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors",
  "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

function AuditOperationMobileRowSkeleton() {
  return (
    <div className="space-y-2.5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-3.5 w-12" />
      </div>
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}

function AuditOperationMobileRow({ operation, onOpenOperation }: AuditOperationMobileRowProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const targetLabel = getOperationTargetLabel(t, operation);
  const changesSummary = formatCountsSummary(t, operation.counts);

  return (
    <li className="group relative transition-colors hover:bg-muted/50">
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={describeOperation(t, operation, i18n.language)}
        onClick={() => onOpenOperation(operation.id)}
      />
      <div className="pointer-events-none relative z-20 px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <OperationKindBadge
            kind={operation.kind}
            t={t}
            compact
            className="h-auto max-w-full shrink whitespace-normal py-1 text-left [&>svg]:shrink-0"
          />
          <time className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={operation.createdAt}>
            {formatAuditDate(operation.createdAt, i18n.language)}
          </time>
        </div>
        <div className="mt-2 flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <OperationActor operation={operation} />
          </div>
          <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{operation.source}</span>
        </div>
        <div className="mt-2 min-w-0 text-xs">
          <OperationTarget operation={operation} targetLabel={targetLabel} className="relative z-30" />
          {changesSummary ? (
            <>
              <span className="px-2 text-muted-foreground" aria-hidden="true">
                ·
              </span>
              <span className="text-muted-foreground">{changesSummary}</span>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function AuditLogsMobileList({
  operations,
  viewState,
  pageSize,
  fillHeight,
  sort,
  emptyState,
  isRetrying,
  listRef,
  onSortChange,
  onOpenOperation,
  onRetry,
}: AuditLogsMobileListProps) {
  const { t } = useTranslation(["admin", "common"]);
  const isAscending = sort === "createdAt";
  const sortDirection = isAscending ? t("common:sorting.ascending") : t("common:sorting.descending");

  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      <div className="flex h-10 items-center border-b bg-muted/20 px-2">
        <button
          type="button"
          className={SORT_BUTTON_CLASS}
          onClick={() => onSortChange(isAscending ? "-createdAt" : "createdAt")}
          aria-label={`${t("auditLogs.columns.timestamp")}: ${sortDirection}`}
        >
          {t("auditLogs.columns.timestamp")}
          <HugeiconsIcon
            icon={Sorting05Icon}
            aria-hidden="true"
            className="size-3.5 text-foreground"
            style={isAscending ? SORT_ASCENDING_ICON_STYLE : undefined}
          />
        </button>
      </div>
      <RecordListMobileList
        viewState={viewState}
        emptyState={emptyState}
        isRetrying={isRetrying}
        onRetry={onRetry}
        skeletonRow={<AuditOperationMobileRowSkeleton />}
        skeletonRowCount={Math.min(pageSize, MAX_SKELETON_ROWS)}
        stateMinHeight={fillHeight}
        listRef={listRef}
      >
        {operations.map((operation) => (
          <AuditOperationMobileRow key={operation.id} operation={operation} onOpenOperation={onOpenOperation} />
        ))}
      </RecordListMobileList>
    </div>
  );
}

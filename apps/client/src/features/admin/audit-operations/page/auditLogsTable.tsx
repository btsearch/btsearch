import { Search01Icon } from "@hugeicons/core-free-icons";
import type { AuditOperationSort } from "@openbts/shared/contract";
import { useTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { describeOperation } from "../labels";
import type { AuditOperation } from "../types";
import { AUDIT_LOGS_SORTING, useAuditLogsColumns } from "./auditLogsColumns";
import { AuditLogsMobileList } from "./auditLogsMobileList";
import { DataTable, type DataTableViewState } from "@/components/ui/data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import type { RecordListEmptyState } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import type { FittedListPagination } from "@/hooks/useFittedListPagination";
import { appTableFeatures } from "@/lib/tableFeatures";

type AuditLogsTableProps = {
  operations: AuditOperation[];
  total: number;
  viewState: DataTableViewState;
  paging: FittedListPagination;
  sort: AuditOperationSort;
  activeFilterCount: number;
  isRetrying: boolean;
  onSortChange: (sort: AuditOperationSort) => void;
  onOpenOperation: (operationId: number) => void;
  onClearFilters: () => void;
  onRetry: () => unknown;
};

function getOperationRowId(operation: AuditOperation): string {
  return String(operation.id);
}

export function AuditLogsTable({
  operations,
  total,
  viewState,
  paging,
  sort,
  activeFilterCount,
  isRetrying,
  onSortChange,
  onOpenOperation,
  onClearFilters,
  onRetry,
}: AuditLogsTableProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const columns = useAuditLogsColumns(sort, onSortChange);
  const { pagination, autoPageSize, pageSizeOptions } = paging;
  const table = useTable({
    features: appTableFeatures,
    data: operations,
    columns,
    getRowId: getOperationRowId,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: { pagination, sorting: AUDIT_LOGS_SORTING[sort] },
    onPaginationChange: paging.setPagination,
  });

  let emptyState: RecordListEmptyState = { icon: Search01Icon, title: t("auditLogs.empty.title") };
  if (activeFilterCount > 0) {
    emptyState = {
      ...emptyState,
      description: t("auditLogs.empty.subtitle"),
      action: <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="cursor-pointer" />,
    };
  }

  if (paging.isMobile) {
    return (
      <div className="flex flex-col">
        <AuditLogsMobileList
          operations={operations}
          viewState={viewState}
          pageSize={pagination.pageSize}
          fillHeight={autoPageSize * paging.mobileRowHeight}
          sort={sort}
          emptyState={emptyState}
          isRetrying={isRetrying}
          listRef={paging.mobileListRef}
          onSortChange={onSortChange}
          onOpenOperation={onOpenOperation}
          onRetry={onRetry}
        />
        <DataTable.PaginationFooter>
          <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} showRowsPerPage={false} />
        </DataTable.PaginationFooter>
      </div>
    );
  }

  return (
    <div className="min-w-full">
      <div className="custom-scrollbar overflow-x-auto">
        <DataTable.Root table={table} className="block rounded-b-none border-b-0">
          <DataTable.Table>
            <DataTable.Header />
            {viewState === "loading" ? <DataTable.Skeleton rows={pagination.pageSize} columns={columns.length} /> : null}
            {viewState === "error" ? (
              <DataTable.Error columns={columns.length} rows={autoPageSize} onRetry={onRetry} isRetrying={isRetrying} />
            ) : null}
            {viewState === "empty" ? <DataTable.EmptyState columns={columns.length} rows={autoPageSize} {...emptyState} /> : null}
            {viewState === "ready" ? (
              <DataTable.Body
                onRowClick={(operation: AuditOperation) => onOpenOperation(operation.id)}
                getRowAriaLabel={(operation: AuditOperation) => describeOperation(t, operation, i18n.language)}
              />
            ) : null}
          </DataTable.Table>
        </DataTable.Root>
      </div>
      <DataTable.PaginationFooter>
        <DataTablePagination table={table} totalItems={total} pageSizeOptions={pageSizeOptions} />
      </DataTable.PaginationFooter>
    </div>
  );
}

import { useTable } from "@tanstack/react-table";

import { type RecordListStateProps, RecordListTable } from "../shared/recordListPrimitives";
import { REFERENCE_LIST_STATE_ROWS } from "../shared/referenceListPage";
import { OPERATOR_LIST_COLUMNS, OPERATOR_LIST_SORTING, OperatorListSortContext } from "./operatorListColumns";
import type { OperatorListSort } from "./operatorListCriteria";
import type { OperatorListRow } from "./useOperatorListRows";
import { Skeleton } from "@/components/ui/skeleton";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type OperatorListTableProps = RecordListStateProps & {
  rows: OperatorListRow[];
  sort: OperatorListSort;
  onSortChange: (sort: OperatorListSort) => void;
  onOpenOperator: (operatorId: number) => void;
};

const SKELETON_BAR_WIDTHS = ["w-12", "w-14", "w-24", "w-8", "w-14", "w-6"];

function getOperatorRowId(row: OperatorListRow): string {
  return String(row.operator.id);
}

function getOperatorHref(row: OperatorListRow): string {
  return `/admin/operators/${row.operator.id}`;
}

function OperatorListSkeletonBody() {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: REFERENCE_LIST_STATE_ROWS }, (_, rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b">
          <td className="p-2 align-middle">
            <div className="flex items-center gap-3 pl-2">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          </td>
          {SKELETON_BAR_WIDTHS.map((width, columnIndex) => (
            <td key={columnIndex} className="p-2 align-middle">
              <Skeleton className={cn("h-4", width)} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function OperatorListTable({ rows, viewState, sort, emptyState, isRetrying, onSortChange, onRetry, onOpenOperator }: OperatorListTableProps) {
  const table = useTable({
    features: appTableFeatures,
    data: rows,
    columns: OPERATOR_LIST_COLUMNS,
    getRowId: getOperatorRowId,
    manualPagination: true,
    manualSorting: true,
    state: { sorting: OPERATOR_LIST_SORTING[sort] },
  });

  function openRow(row: OperatorListRow) {
    onOpenOperator(row.operator.id);
  }

  return (
    <OperatorListSortContext.Provider value={{ sort, onSortChange }}>
      <RecordListTable
        table={table}
        skeletonBody={<OperatorListSkeletonBody />}
        getRowHref={getOperatorHref}
        onRowClick={openRow}
        viewState={viewState}
        emptyState={emptyState}
        isRetrying={isRetrying}
        onRetry={onRetry}
      />
    </OperatorListSortContext.Provider>
  );
}

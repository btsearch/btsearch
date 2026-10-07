import { useTable } from "@tanstack/react-table";

import { type RecordListStateProps, RecordListTable } from "../shared/recordListPrimitives";
import { OwnerLocationCountsContext } from "./structureOwnerListCells";
import {
  STRUCTURE_OWNER_LIST_COLUMNS,
  STRUCTURE_OWNER_LIST_SORTING,
  type StructureOwnerListControls,
  StructureOwnerListControlsContext,
} from "./structureOwnerListColumns";
import { StructureOwnerListMobileList } from "./structureOwnerListMobileList";
import type { OwnerLocationCounts, StructureOwnerListRow } from "./useStructureOwnerListRows";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useMobile";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type StructureOwnerListTableProps = RecordListStateProps &
  StructureOwnerListControls & {
    rows: StructureOwnerListRow[];
    locationCounts: OwnerLocationCounts;
  };

const ROW_CLASS = "h-14";
const SKELETON_ROW_COUNT = 6;
const SKELETON_BAR_WIDTHS = ["w-24", "w-20", "w-28"];

function getOwnerRowId(row: StructureOwnerListRow): string {
  return String(row.owner.id);
}

function StructureOwnerListSkeletonBody() {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <tr key={rowIndex} className={cn(ROW_CLASS, "border-b")}>
          <td className="p-2 align-middle">
            <div className="flex items-center gap-3 pl-2">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-40" />
            </div>
          </td>
          {SKELETON_BAR_WIDTHS.map((width) => (
            <td key={width} className="p-2 align-middle">
              <Skeleton className={cn("h-4", width)} />
            </td>
          ))}
          <td className="p-2 align-middle">
            <Skeleton className="ml-auto h-4 w-10" />
          </td>
          <td />
        </tr>
      ))}
    </tbody>
  );
}

export function StructureOwnerListTable({
  rows,
  locationCounts,
  viewState,
  emptyState,
  isRetrying,
  onRetry,
  sort,
  onSortChange,
  onEdit,
  onDelete,
}: StructureOwnerListTableProps) {
  const isMobile = useIsMobile();
  const table = useTable({
    features: appTableFeatures,
    data: rows,
    columns: STRUCTURE_OWNER_LIST_COLUMNS,
    getRowId: getOwnerRowId,
    manualPagination: true,
    manualSorting: true,
    state: { sorting: STRUCTURE_OWNER_LIST_SORTING[sort] },
  });

  return (
    <StructureOwnerListControlsContext.Provider value={{ sort, onSortChange, onEdit, onDelete }}>
      <OwnerLocationCountsContext.Provider value={locationCounts}>
        {isMobile ? (
          <StructureOwnerListMobileList rows={rows} viewState={viewState} emptyState={emptyState} isRetrying={isRetrying} onRetry={onRetry} />
        ) : (
          <RecordListTable
            table={table}
            skeletonBody={<StructureOwnerListSkeletonBody />}
            rowClassName={ROW_CLASS}
            viewState={viewState}
            emptyState={emptyState}
            isRetrying={isRetrying}
            onRetry={onRetry}
          />
        )}
      </OwnerLocationCountsContext.Provider>
    </StructureOwnerListControlsContext.Provider>
  );
}

import { useTable } from "@tanstack/react-table";

import { type RecordListStateProps, RecordListTable } from "../shared/recordListPrimitives";
import { BRAND_LIST_COLUMNS, type BrandListActions, BrandListActionsContext } from "./brandListColumns";
import { BrandListMobileList } from "./brandListMobileList";
import type { BrandListRow } from "./useBrandListRows";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useMobile";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type BrandListTableProps = RecordListStateProps &
  BrandListActions & {
    rows: BrandListRow[];
  };

const SKELETON_ROW_COUNT = 6;
const SKELETON_BAR_WIDTHS = ["w-20", "w-24", "w-28", "w-32", "w-36"];

function getBrandRowId(row: BrandListRow): string {
  return String(row.brand.id);
}

function BrandListSkeletonBody() {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b">
          <td className="p-2 align-middle">
            <div className="flex items-center gap-3 pl-2">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-28" />
            </div>
          </td>
          {SKELETON_BAR_WIDTHS.map((width) => (
            <td key={width} className="p-2 align-middle">
              <Skeleton className={cn("h-4", width)} />
            </td>
          ))}
          <td />
        </tr>
      ))}
    </tbody>
  );
}

export function BrandListTable({ rows, viewState, emptyState, isRetrying, onRetry, onEdit, onDelete }: BrandListTableProps) {
  const isMobile = useIsMobile();
  const table = useTable({
    features: appTableFeatures,
    data: rows,
    columns: BRAND_LIST_COLUMNS,
    getRowId: getBrandRowId,
    manualPagination: true,
  });

  return (
    <BrandListActionsContext.Provider value={{ onEdit, onDelete }}>
      {isMobile ? (
        <BrandListMobileList rows={rows} viewState={viewState} emptyState={emptyState} isRetrying={isRetrying} onRetry={onRetry} />
      ) : (
        <RecordListTable
          table={table}
          skeletonBody={<BrandListSkeletonBody />}
          viewState={viewState}
          emptyState={emptyState}
          isRetrying={isRetrying}
          onRetry={onRetry}
        />
      )}
    </BrandListActionsContext.Provider>
  );
}

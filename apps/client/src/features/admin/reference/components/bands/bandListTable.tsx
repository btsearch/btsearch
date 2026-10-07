import { useTable } from "@tanstack/react-table";

import { type RecordListStateProps, RecordListTable } from "../shared/recordListPrimitives";
import { BAND_LIST_COLUMNS, type BandListActions, BandListActionsContext } from "./bandListColumns";
import { BandListMobileList } from "./bandListMobileList";
import type { BandListRow } from "./useBandListRows";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/useMobile";
import { appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type BandListTableProps = RecordListStateProps &
  BandListActions & {
    rows: BandListRow[];
  };

const ROW_CLASS = "h-12";
const SKELETON_ROW_COUNT = 12;
const SKELETON_BAR_WIDTHS = ["w-16", "w-10", "w-24", "w-20", "w-8"];

function getBandRowId(row: BandListRow): string {
  return String(row.band.id);
}

function BandListSkeletonBody() {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <tr key={rowIndex} className={cn(ROW_CLASS, "border-b")}>
          <td className="p-2 align-middle">
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-4 w-6 shrink-0 rounded-sm" />
              <Skeleton className="h-4 w-28" />
            </div>
          </td>
          {SKELETON_BAR_WIDTHS.map((width) => (
            <td key={width} className="p-2 align-middle">
              <Skeleton className={cn("h-4", width)} />
            </td>
          ))}
          <td className="p-2 align-middle">
            <Skeleton className="mr-2 ml-auto h-4 w-14" />
          </td>
          <td />
        </tr>
      ))}
    </tbody>
  );
}

export function BandListTable({ rows, viewState, emptyState, isRetrying, onRetry, onEdit, onDelete }: BandListTableProps) {
  const isMobile = useIsMobile();
  const table = useTable({
    features: appTableFeatures,
    data: rows,
    columns: BAND_LIST_COLUMNS,
    getRowId: getBandRowId,
    manualPagination: true,
  });

  return (
    <BandListActionsContext.Provider value={{ onEdit, onDelete }}>
      {isMobile ? (
        <BandListMobileList rows={rows} viewState={viewState} emptyState={emptyState} isRetrying={isRetrying} onRetry={onRetry} />
      ) : (
        <RecordListTable
          table={table}
          skeletonBody={<BandListSkeletonBody />}
          rowClassName={ROW_CLASS}
          viewState={viewState}
          emptyState={emptyState}
          isRetrying={isRetrying}
          onRetry={onRetry}
        />
      )}
    </BandListActionsContext.Provider>
  );
}

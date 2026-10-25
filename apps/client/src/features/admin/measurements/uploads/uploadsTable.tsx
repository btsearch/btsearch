import type { MeasurementUpload } from "@openbts/shared/contract";
import { type Row, flexRender, useTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { CursorPagination } from "../components/cursorPagination";
import { UPLOAD_COLUMNS, type UploadRowActions, UploadRowActionsContext, getUploadDetailsId } from "./uploadColumns";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { DataTable, type DataTableViewState } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { RecordListEmptyState } from "@/features/admin/reference/components/shared/recordListPrimitives";
import {
  UploadDiscoveries,
  UploadDrops,
  UploadKeptReadings,
  type UploadResult,
  UploadTimes,
} from "@/features/settings/components/measurements/uploadResult";
import { type AppTableFeatures, appTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

type UploadsPaging = {
  pageIndex: number;
  pageSize: number;
  autoPageSize: number;
  pageSizeOptions: readonly number[];
  hasNextPage: boolean;
  onPageSizeChange: (pageSize: number) => void;
  onFirstPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

type UploadsTableProps = {
  uploads: MeasurementUpload[];
  total: number;
  viewState: DataTableViewState;
  paging: UploadsPaging;
  actions: UploadRowActions;
  emptyState: RecordListEmptyState;
  isRetrying: boolean;
  onRetry: () => void;
};

type UploadRowsProps = {
  row: Row<AppTableFeatures, MeasurementUpload>;
  isOpen: boolean;
  columnCount: number;
};

const COLUMN_COUNT = UPLOAD_COLUMNS.length;
const MAX_SKELETON_ROWS = 20;
const SKELETON_BAR_WIDTHS = ["w-20", "w-24", "w-16", "w-24", "w-14", "w-12", "w-16"];
const DETAILS_PANEL_CLASS = cn(
  "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out motion-reduce:transition-none",
  "data-ending-style:h-0 data-starting-style:h-0",
);

function getUploadRowId(upload: MeasurementUpload): string {
  return upload.id;
}

function UploadsSkeletonBody({ rowCount }: { rowCount: number }) {
  return (
    <tbody aria-hidden="true" className="[&_tr:last-child]:border-0">
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={rowIndex} className="h-16 border-b">
          <td className="p-2 align-middle">
            <Skeleton className="ml-2 h-4 w-28" />
          </td>
          <td className="p-2 align-middle">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-28" />
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

function UploadDetails({ result }: { result: UploadResult }) {
  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)_300px] gap-10 pt-1 pr-6 pb-4.5 pl-[158px]">
      <div className="min-w-0">
        <UploadKeptReadings samples={result.samples} />
        <UploadTimes result={result} className="mt-4" />
      </div>
      <UploadDrops result={result} className="min-w-0" />
      <UploadDiscoveries discoveries={result.discoveries} />
    </div>
  );
}

function UploadRows({ row, isOpen, columnCount }: UploadRowsProps) {
  const { result } = row.original;

  return (
    <>
      <tr
        data-state={isOpen ? "open" : undefined}
        className={cn("h-16 transition-colors", isOpen ? "bg-muted/50" : "hover:bg-muted/50", result === null && "border-b")}
      >
        {row.getVisibleCells().map((cell) => (
          <td key={cell.id} className="overflow-hidden p-2 align-middle" style={{ width: cell.column.getSize() }}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
      {result === null ? null : (
        <tr className={cn("border-b transition-colors", isOpen && "bg-muted/50")}>
          <td colSpan={columnCount} className="p-0">
            <Collapsible open={isOpen}>
              <CollapsibleContent id={getUploadDetailsId(row.original.id)} className={DETAILS_PANEL_CLASS}>
                <UploadDetails result={result} />
              </CollapsibleContent>
            </Collapsible>
          </td>
        </tr>
      )}
    </>
  );
}

export function UploadsTable({ uploads, total, viewState, paging, actions, emptyState, isRetrying, onRetry }: UploadsTableProps) {
  const { t } = useTranslation("settings");
  const table = useTable({
    features: appTableFeatures,
    data: uploads,
    columns: UPLOAD_COLUMNS,
    getRowId: getUploadRowId,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
  });

  return (
    <div className="min-w-full">
      <div className="custom-scrollbar overflow-x-auto">
        <UploadRowActionsContext.Provider value={actions}>
          <DataTable.Root table={table} className="block rounded-b-none border-b-0">
            <DataTable.Table>
              <DataTable.Header />
              {viewState === "loading" ? <UploadsSkeletonBody rowCount={Math.min(paging.pageSize, MAX_SKELETON_ROWS)} /> : null}
              {viewState === "error" ? (
                <DataTable.Error
                  columns={COLUMN_COUNT}
                  rows={paging.autoPageSize}
                  title={t("measurements.uploads.loadFailed")}
                  onRetry={onRetry}
                  isRetrying={isRetrying}
                />
              ) : null}
              {viewState === "empty" ? <DataTable.EmptyState columns={COLUMN_COUNT} rows={paging.autoPageSize} {...emptyState} /> : null}
              {viewState === "ready" ? (
                <tbody className="[&_tr:last-child]:border-0">
                  {table.getRowModel().rows.map((row) => (
                    <UploadRows key={row.id} row={row} isOpen={actions.openIds.has(row.id)} columnCount={COLUMN_COUNT} />
                  ))}
                </tbody>
              ) : null}
            </DataTable.Table>
          </DataTable.Root>
        </UploadRowActionsContext.Provider>
      </div>
      <DataTable.PaginationFooter>
        <CursorPagination
          pageIndex={paging.pageIndex}
          pageSize={paging.pageSize}
          rowCount={viewState === "ready" ? uploads.length : 0}
          total={total}
          hasNextPage={paging.hasNextPage}
          pageSizeOptions={paging.pageSizeOptions}
          onPageSizeChange={paging.onPageSizeChange}
          onFirstPage={paging.onFirstPage}
          onPreviousPage={paging.onPreviousPage}
          onNextPage={paging.onNextPage}
        />
      </DataTable.PaginationFooter>
    </div>
  );
}

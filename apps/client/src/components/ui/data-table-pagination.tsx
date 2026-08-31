import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import ArrowLeftDoubleIcon from "@hugeicons/core-free-icons/ArrowLeftDoubleIcon";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import ArrowRightDoubleIcon from "@hugeicons/core-free-icons/ArrowRightDoubleIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactTable, RowData } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import i18n from "@/i18n/config";
import type { AppTableFeatures } from "@/lib/tableFeatures";

interface DataTablePaginationProps<TData extends RowData> {
  table: ReactTable<AppTableFeatures, TData>;
  pageSizeOptions?: number[];
  totalItems?: number;
  showRowsPerPage?: boolean;
}

export function DataTablePagination<TData extends RowData>({
  table,
  pageSizeOptions = [10, 20, 30, 50, 100],
  totalItems,
  showRowsPerPage = true,
}: DataTablePaginationProps<TData>) {
  const { t } = useTranslation("common");
  const pageIndex = table.state.pagination.pageIndex;
  const pageSize = table.state.pagination.pageSize;
  const pageCount = table.getPageCount();

  const rowCount = totalItems ?? table.getRowCount();
  const startRow = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, rowCount);

  return (
    <div className="flex items-center justify-between gap-4 px-2">
      <div className="text-muted-foreground text-sm tabular-nums" aria-live="polite" aria-atomic="true">
        {totalItems !== undefined
          ? t("pagination.range", { start: startRow, end: endRow, total: totalItems.toLocaleString(i18n.language) })
          : t("pagination.pageCount", { page: pageIndex + 1, pages: pageCount })}
      </div>

      <div className="flex items-center gap-2">
        {showRowsPerPage ? (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-muted-foreground text-sm hidden sm:block">{t("pagination.rows")}</span>
            <Select
              value={pageSize}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger size="sm" className="w-16" aria-label={t("pagination.rowsPerPage")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
            <HugeiconsIcon icon={ArrowLeftDoubleIcon} className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("pagination.firstPage")}</span>
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("pagination.previousPage")}</span>
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("pagination.nextPage")}</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("pagination.lastPage")}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

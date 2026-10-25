import { ArrowLeft01Icon, ArrowLeftDoubleIcon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CursorPaginationProps = {
  pageIndex: number;
  pageSize: number;
  rowCount: number;
  total: number;
  hasNextPage: boolean;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
  onFirstPage: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function CursorPagination({
  pageIndex,
  pageSize,
  rowCount,
  total,
  hasNextPage,
  pageSizeOptions,
  onPageSizeChange,
  onFirstPage,
  onPreviousPage,
  onNextPage,
}: CursorPaginationProps) {
  const { t, i18n } = useTranslation("common");
  const firstRow = pageIndex * pageSize;
  const hasPreviousPage = pageIndex > 0;

  return (
    <div className="flex items-center justify-between gap-4 px-2">
      <div className="text-sm text-muted-foreground tabular-nums" aria-live="polite" aria-atomic="true">
        {t("pagination.range", { start: rowCount === 0 ? 0 : firstRow + 1, end: firstRow + rowCount, total: total.toLocaleString(i18n.language) })}
      </div>

      <div className="flex items-center gap-2">
        {pageSizeOptions !== undefined && onPageSizeChange !== undefined ? (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="hidden text-sm text-muted-foreground sm:block">{t("pagination.rows")}</span>
            <Select value={pageSize} onValueChange={(value) => onPageSizeChange(Number(value))}>
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
          <Button variant="outline" size="icon" className="size-8 cursor-pointer" onClick={onFirstPage} disabled={!hasPreviousPage}>
            <HugeiconsIcon icon={ArrowLeftDoubleIcon} className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("pagination.firstPage")}</span>
          </Button>
          <Button variant="outline" size="icon" className="size-8 cursor-pointer" onClick={onPreviousPage} disabled={!hasPreviousPage}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("pagination.previousPage")}</span>
          </Button>
          <Button variant="outline" size="icon" className="size-8 cursor-pointer" onClick={onNextPage} disabled={!hasNextPage}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("pagination.nextPage")}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

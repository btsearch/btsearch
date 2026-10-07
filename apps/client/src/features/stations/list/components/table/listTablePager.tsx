import { ArrowLeft01Icon, ArrowLeftDoubleIcon, ArrowRight01Icon, ArrowRightDoubleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { LIST_PAGER_HEIGHT_CLASS } from "./listTableRow";
import type { ListTablePaging } from "./useListTablePaging";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FIRST_LIST_PAGE } from "@/features/stations/list/data/listPaging";
import { cn } from "@/lib/utils";

type ListTablePagerProps = {
  paging: ListTablePaging;
  page: number;
  pageCount: number;
  total: number | null;
};

type PagerButtonProps = {
  label: string;
  icon: IconSvgElement;
  isDisabled: boolean;
  onClick: () => void;
};

type PageRange = {
  start: number;
  end: number;
  total: number;
};

const TEXT_CLASS = "text-sm text-muted-foreground tabular-nums";

function getPageRange(page: number, pageSize: number | null, total: number | null): PageRange | null {
  if (pageSize === null || total === null) return null;

  const start = (page - FIRST_LIST_PAGE) * pageSize + 1;
  return start > total ? null : { start, end: Math.min(start + pageSize - 1, total), total };
}

function formatPageRange(range: PageRange, language: string): Record<keyof PageRange, string> {
  return { start: range.start.toLocaleString(language), end: range.end.toLocaleString(language), total: range.total.toLocaleString(language) };
}

function PagerButton({ label, icon, isDisabled, onClick }: PagerButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        onClick={onClick}
        render={<Button type="button" variant="outline" size="icon" disabled={isDisabled} className="cursor-pointer" />}
      >
        <HugeiconsIcon icon={icon} className="size-4" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ListTablePager({ paging, page, pageCount, total }: ListTablePagerProps) {
  const { t, i18n } = useTranslation("common");
  const { language } = i18n;
  const { isMobile, pageSize, fittedPageSize, pageSizeOptions, onPageChange, onPageSizePick } = paging;
  const range = getPageRange(page, pageSize, total);
  const canGoBack = page > FIRST_LIST_PAGE;
  const canGoOn = range !== null && page < pageCount;

  return (
    <DataTable.PaginationFooter className={LIST_PAGER_HEIGHT_CLASS}>
      <div className="flex items-center justify-between gap-4 px-2">
        <div className={TEXT_CLASS} aria-live="polite" aria-atomic="true">
          {range === null ? null : t("pagination.range", formatPageRange(range, language))}
        </div>

        <div className="flex items-center gap-2">
          {isMobile ? null : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("pagination.rows")}</span>
              <Select value={pageSize ?? fittedPageSize} onValueChange={(value) => onPageSizePick(Number(value))}>
                <SelectTrigger size="sm" className="w-16 cursor-pointer" aria-label={t("pagination.rowsPerPage")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={size} className="cursor-pointer">
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {range === null ? null : (
            <span className={cn(TEXT_CLASS, "max-sm:hidden")}>
              {t("pagination.pageCount", { page: page.toLocaleString(language), pages: pageCount.toLocaleString(language) })}
            </span>
          )}

          <div className="flex items-center gap-1">
            <PagerButton
              label={t("pagination.firstPage")}
              icon={ArrowLeftDoubleIcon}
              isDisabled={!canGoBack}
              onClick={() => onPageChange(FIRST_LIST_PAGE)}
            />
            <PagerButton label={t("pagination.previousPage")} icon={ArrowLeft01Icon} isDisabled={!canGoBack} onClick={() => onPageChange(page - 1)} />
            <PagerButton label={t("pagination.nextPage")} icon={ArrowRight01Icon} isDisabled={!canGoOn} onClick={() => onPageChange(page + 1)} />
            <PagerButton label={t("pagination.lastPage")} icon={ArrowRightDoubleIcon} isDisabled={!canGoOn} onClick={() => onPageChange(pageCount)} />
          </div>
        </div>
      </div>
    </DataTable.PaginationFooter>
  );
}

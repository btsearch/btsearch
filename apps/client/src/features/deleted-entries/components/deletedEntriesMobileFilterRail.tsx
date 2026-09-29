import { Calendar03Icon, FilterIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { DELETED_ENTRY_SOURCE_FILTERS } from "../constants";
import { getDeletedEntrySourceFilterLabel } from "../labels";
import type { DeletedEntrySourceFilter } from "../types";
import { DeletedEntriesSearchField } from "./deletedEntriesSearchField";
import { Button } from "@/components/ui/button";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { DatePickerButton } from "@/features/admin/audit-operations/components/datePickerButton";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { cn } from "@/lib/utils";

type DeletedEntriesMobileFilterRailProps = {
  search: string;
  source: DeletedEntrySourceFilter;
  dateFrom: string;
  dateTo: string;
  activeFilterCount: number;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: DeletedEntrySourceFilter) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear: () => void;
};

export function DeletedEntriesMobileFilterRail({
  search,
  source,
  dateFrom,
  dateTo,
  activeFilterCount,
  onSearchChange,
  onSourceChange,
  onDateFromChange,
  onDateToChange,
  onClear,
}: DeletedEntriesMobileFilterRailProps) {
  const { t } = useTranslation(["deletedEntries", "common", "stationDetails"]);
  const dateFilterCount = Number(dateFrom !== "") + Number(dateTo !== "");

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("common:labels.filters")}>
      <MobileFilterChip active={search.trim() !== ""} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <DeletedEntriesSearchField value={search} onChange={onSearchChange} label={t("common:labels.search")} inputClassName="h-9" />
      </MobileFilterChip>

      <MobileFilterChip active={source !== "all"} icon={FilterIcon} label={t("deletedEntries.columns.sourceType")}>
        <MobileFilterPanelTitle>{t("deletedEntries.columns.sourceType")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {DELETED_ENTRY_SOURCE_FILTERS.map((value) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              aria-pressed={source === value}
              onClick={() => onSourceChange(value)}
              className={cn(
                "w-full justify-start px-2 font-normal",
                source === value && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
            >
              {getDeletedEntrySourceFilterLabel(t, value)}
            </Button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={dateFilterCount > 0} count={dateFilterCount} icon={Calendar03Icon} label={t("deletedEntries.filters.dateRange")}>
        <MobileFilterPanelTitle>{t("deletedEntries.filters.dateRange")}</MobileFilterPanelTitle>
        <div className="flex flex-col gap-2">
          <div role="group" aria-labelledby="deleted-entries-mobile-date-from-label" className="flex flex-col gap-1">
            <span id="deleted-entries-mobile-date-from-label" className="px-1 text-xs text-muted-foreground">
              {t("deletedEntries.filters.dateFrom")}
            </span>
            <DatePickerButton value={dateFrom} onChange={onDateFromChange} label={t("deletedEntries.filters.dateFrom")} />
          </div>
          <div role="group" aria-labelledby="deleted-entries-mobile-date-to-label" className="flex flex-col gap-1">
            <span id="deleted-entries-mobile-date-to-label" className="px-1 text-xs text-muted-foreground">
              {t("deletedEntries.filters.dateTo")}
            </span>
            <DatePickerButton value={dateTo} onChange={onDateToChange} label={t("deletedEntries.filters.dateTo")} />
          </div>
        </div>
      </MobileFilterChip>

      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClear} /> : null}
    </div>
  );
}

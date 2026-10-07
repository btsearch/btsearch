import { Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ANALYZER_SORTS, ANALYZER_VIEWS, type AnalyzerFilters } from "../model/filters";
import { ANALYZER_COMPACT_SORT_LABEL_CLASS, ANALYZER_COMPACT_SORT_TRIGGER_CLASS } from "./analyzerLayout";
import { useAnalyzerTexts } from "./analyzerTexts";
import type { AnalyzerFiltersChange } from "./analyzerTypes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type ViewSwitchProps = {
  view: AnalyzerFilters["view"];
  isDisabled: boolean;
  className?: string;
  onFiltersChange: AnalyzerFiltersChange;
};

type AnalyzerToolbarProps = {
  filters: AnalyzerFilters;
  hasResults: boolean;
  selectionBar: ReactNode;
  onFiltersChange: AnalyzerFiltersChange;
};

export function ViewSwitch({ view, isDisabled, className, onFiltersChange }: ViewSwitchProps) {
  const { t } = useTranslation("cellAnalyzer");
  const labels: Record<AnalyzerFilters["view"], string> = { cells: t("common:labels.cells"), stations: t("common:labels.stations") };

  return (
    <SegmentedControl
      value={view}
      options={ANALYZER_VIEWS.map((option) => ({ value: option, label: labels[option] }))}
      onValueChange={(nextView) => onFiltersChange((current) => ({ ...current, view: nextView }))}
      ariaLabel={t("toolbar.view")}
      disabled={isDisabled}
      className={className}
    />
  );
}

export function AnalyzerToolbar({ filters, hasResults, selectionBar, onFiltersChange }: AnalyzerToolbarProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { getSortLabel } = useAnalyzerTexts();
  const sortLabel = t("toolbar.sortLabel", { sort: getSortLabel(filters.sort) });

  function pickSort(value: unknown) {
    const sort = ANALYZER_SORTS.find((option) => option === value);
    if (sort !== undefined) onFiltersChange((current) => ({ ...current, sort }));
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-2">
      <ViewSwitch view={filters.view} isDisabled={!hasResults} className="shrink-0" onFiltersChange={onFiltersChange} />
      <div className="flex min-w-0 flex-1 justify-end">{selectionBar}</div>
      <Select value={filters.sort} onValueChange={pickSort} disabled={!hasResults}>
        <SelectTrigger aria-label={sortLabel} title={sortLabel} className={cn("shrink-0 cursor-pointer", ANALYZER_COMPACT_SORT_TRIGGER_CLASS)}>
          <HugeiconsIcon icon={Sorting05Icon} className="size-4 text-muted-foreground" aria-hidden="true" />
          <SelectValue className={ANALYZER_COMPACT_SORT_LABEL_CLASS}>{getSortLabel(filters.sort)}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end" alignItemWithTrigger={false} className="min-w-44">
          {ANALYZER_SORTS.map((sort) => (
            <SelectItem key={sort} value={sort} className="cursor-pointer">
              {getSortLabel(sort)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

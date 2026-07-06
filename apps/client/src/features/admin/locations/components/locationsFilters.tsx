import { ArrowDown01Icon, Cancel01Icon, Search02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Checkbox as UICheckbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Separator } from "@/components/ui/separator";
import { TOP4_MNCS, getOperatorColor } from "@/lib/operatorUtils";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

import type { LocationFilters } from "../hooks/useLocationsData";

type LocationsFiltersProps = {
  filters: LocationFilters;
  operators: Operator[];
  regions: Region[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (filters: LocationFilters) => void;
  onRegionsChange: (regionIds: number[]) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
  locationCount: number;
  totalLocations?: number;
  isSheet?: boolean;
};

export function LocationsFilters({
  filters,
  operators,
  regions,
  selectedRegions,
  searchQuery: parentSearchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  locationCount,
  totalLocations,
  isSheet = false,
}: LocationsFiltersProps) {
  const { t } = useTranslation(["admin", "common"]);
  const activeFilterCount = filters.operators.length + selectedRegions.length;

  const [showOtherOperators, setShowOtherOperators] = useState(false);
  const [localSearch, setLocalSearch] = useState(parentSearchQuery);

  const topOperators = useMemo(() => operators.filter((op) => TOP4_MNCS.includes(op.mnc)), [operators]);
  const otherOperators = useMemo(() => operators.filter((op) => !TOP4_MNCS.includes(op.mnc)), [operators]);
  const hasSelectedOther = otherOperators.some((op) => filters.operators.includes(op.mnc));
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const selectedRegionItems = useMemo(
    () => selectedRegions.map((id) => regionById.get(id)).filter((region): region is Region => region !== undefined),
    [selectedRegions, regionById],
  );
  const visibleSelectedRegions = useMemo(() => selectedRegionItems.slice(0, 1), [selectedRegionItems]);
  const hiddenSelectedRegionCount = selectedRegionItems.length - visibleSelectedRegions.length;

  const searchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      onSearchQueryChange(localSearch);
    }, 500);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [localSearch, onSearchQueryChange]);

  const handleClearSearch = () => {
    setLocalSearch("");
    onSearchQueryChange("");
  };

  const handleToggleOperator = (mnc: number) => {
    onFiltersChange({ ...filters, operators: toggleValue(filters.operators, mnc) });
  };

  const handleClearFilters = () => {
    onClearAllFilters();
  };

  const regionChipsRef = useRef<HTMLDivElement>(null);

  return (
    <aside className={cn("shrink-0 overflow-y-auto h-full", isSheet ? "w-full" : "w-72 border-r bg-muted/20")}>
      <div className="p-3 space-y-4">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("common:labels.search")}</span>
        <div className="relative">
          <div className="rounded-lg border bg-background">
            <div className="flex items-center gap-1 px-3 py-2">
              <HugeiconsIcon icon={Search02Icon} className="size-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder={t("common:placeholder.search")}
                className="flex-1 min-w-16 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
              {localSearch && (
                <button type="button" onClick={handleClearSearch} className="p-0.5 hover:bg-muted rounded transition-colors shrink-0">
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {!isSheet && (
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t("common:labels.filters")}</h2>
            {activeFilterCount > 0 && (
              <button type="button" onClick={handleClearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {t("common:actions.clearAll")}
              </button>
            )}
          </div>
        )}

        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("common:labels.operator")}</span>
          <div className="space-y-0.5">
            {topOperators.map((op) => (
              <label
                htmlFor={`loc-operator-${op.mnc}`}
                key={op.mnc}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors",
                  filters.operators.includes(op.mnc) ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                <UICheckbox
                  id={`loc-operator-${op.mnc}`}
                  checked={filters.operators.includes(op.mnc)}
                  onCheckedChange={() => handleToggleOperator(op.mnc)}
                />
                <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(op.mnc) }} />
                <span className="text-sm truncate">{op.name}</span>
              </label>
            ))}
          </div>

          {otherOperators.length > 0 && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setShowOtherOperators(!showOtherOperators)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 transition-transform", showOtherOperators && "rotate-180")} />
                <span>
                  {t("common:labels.otherOperators", { count: otherOperators.length })}
                  {hasSelectedOther &&
                    ` (${t("common:labels.selected", { count: otherOperators.filter((op) => filters.operators.includes(op.mnc)).length })})`}
                </span>
              </button>

              {showOtherOperators && (
                <div className="space-y-0.5 mt-1.5 pt-1.5 border-t border-border/50">
                  {otherOperators.map((op) => (
                    <label
                      htmlFor={`loc-operator-${op.mnc}`}
                      key={op.mnc}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors",
                        filters.operators.includes(op.mnc) ? "bg-primary/10" : "hover:bg-muted",
                      )}
                    >
                      <UICheckbox
                        id={`loc-operator-${op.mnc}`}
                        checked={filters.operators.includes(op.mnc)}
                        onCheckedChange={() => handleToggleOperator(op.mnc)}
                      />
                      <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(op.mnc) }} />
                      <span className="text-sm truncate">{op.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("common:labels.region")}</span>
          <Combobox multiple value={selectedRegionItems} onValueChange={(values) => onRegionsChange(values.map((v) => v.id))} items={regions}>
            <ComboboxChips ref={regionChipsRef} className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm">
              {visibleSelectedRegions.map((region) => (
                <ComboboxChip key={region.id} className="max-w-40 shrink-0">
                  <span className="truncate">{region.name}</span>
                </ComboboxChip>
              ))}
              {hiddenSelectedRegionCount > 0 ? (
                <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                  +{hiddenSelectedRegionCount}
                </ComboboxChip>
              ) : null}
              <ComboboxChipsInput
                className={selectedRegions.length === 0 ? "min-w-0" : "min-w-2 w-2 flex-none"}
                placeholder={selectedRegions.length === 0 ? t("common:placeholder.selectRegions") : ""}
              />
            </ComboboxChips>
            <ComboboxContent anchor={regionChipsRef}>
              <ComboboxList>
                <ComboboxEmpty>-</ComboboxEmpty>
                {regions.map((region) => (
                  <ComboboxItem key={region.id} value={region}>
                    {region.name}
                  </ComboboxItem>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t">
          {totalLocations !== undefined
            ? t("main:filters.showingLocationsOfTotal", { count: locationCount, total: totalLocations })
            : t("locations.showingLocations", { count: locationCount })}
        </div>
      </div>
    </aside>
  );
}

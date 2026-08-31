import { ArrowDown01Icon, Cancel01Icon, Search02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef, useState } from "react";
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
import { AutocompleteDropdown } from "@/features/map/components/search-overlay/autocompleteDropdown";
import { FILTER_KEYWORDS } from "@/features/map/constants";
import { parseFilters } from "@/features/map/filters";
import { useSearchState } from "@/features/map/hooks/useSearchState";
import { TOP4_MNCS, getOperatorColor } from "@/lib/operatorUtils";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator, Region, StationFilters, StationStatus } from "@/types/station";

import { toggleStationStatusSelection } from "../stationStatus";
import { StationStatusFilter } from "./stationStatusFilter";

const STATIONS_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((kw) => kw.availableOn.includes("stations"));

const RAT_OPTIONS = [
  { value: "NR", label: "NR", gen: "5G" },
  { value: "LTE", label: "LTE", gen: "4G" },
  { value: "UMTS", label: "UMTS", gen: "3G" },
  { value: "GSM", label: "GSM", gen: "2G" },
  { value: "iot", label: "IoT", gen: "NB" },
] as const;

type StationsFiltersProps = {
  filters: StationFilters;
  operators: Operator[];
  regions: Region[];
  uniqueBandValues: number[];
  selectedRegions: number[];
  searchQuery: string;
  onFiltersChange: (filters: StationFilters) => void;
  onRegionsChange: (regionIds: number[]) => void;
  onClearAllFilters: () => void;
  onSearchQueryChange: (query: string) => void;
  hasActiveFilters: boolean;
  stationCount: number;
  totalStations?: number;
  isSheet?: boolean;
};

export function StationsFilters({
  filters,
  operators,
  regions,
  uniqueBandValues,
  selectedRegions,
  searchQuery: parentSearchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  hasActiveFilters,
  stationCount,
  totalStations,
  isSheet = false,
}: StationsFiltersProps) {
  const { t } = useTranslation(["stations", "common"]);
  const [showOtherOperators, setShowOtherOperators] = useState(false);

  const topOperators = useMemo(
    () => operators.filter((op) => TOP4_MNCS.includes(op.mnc)).sort((a, b) => TOP4_MNCS.indexOf(a.mnc) - TOP4_MNCS.indexOf(b.mnc)),
    [operators],
  );
  const otherOperators = useMemo(() => operators.filter((op) => !TOP4_MNCS.includes(op.mnc)), [operators]);
  const hasSelectedOther = useMemo(() => otherOperators.some((op) => filters.operators.includes(op.mnc)), [otherOperators, filters.operators]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const selectedRegionItems = useMemo(
    () => selectedRegions.map((id) => regionById.get(id)).filter((region): region is Region => region !== undefined),
    [selectedRegions, regionById],
  );
  const visibleSelectedRegions = useMemo(() => selectedRegionItems.slice(0, 1), [selectedRegionItems]);
  const visibleSelectedBands = useMemo(() => filters.bands.slice(0, 2), [filters.bands]);
  const hiddenSelectedRegionCount = selectedRegionItems.length - visibleSelectedRegions.length;
  const hiddenSelectedBandCount = filters.bands.length - visibleSelectedBands.length;

  const {
    inputValue,
    parsedFilters,
    autocompleteOptions,
    activeOverlay,
    isFocused,
    containerRef,
    inputRef,
    focusedChipIndex,
    handleContainerBlur,
    handleInputChange,
    handleInputFocus,
    handleInputClick,
    handleKeyDown,
    applyAutocomplete,
    clearSearch,
    removeFilter,
  } = useSearchState({
    filterKeywords: STATIONS_FILTER_KEYWORDS,
    parseFilters,
    externalQuery: parentSearchQuery,
    onQueryChange: onSearchQueryChange,
  });

  const handleClearSearch = () => {
    clearSearch();
  };

  const handleToggleOperator = (mnc: number) => {
    onFiltersChange({ ...filters, operators: toggleValue(filters.operators, mnc) });
  };

  const handleToggleRat = (rat: string) => {
    onFiltersChange({ ...filters, rat: toggleValue(filters.rat, rat) });
  };

  const handleToggleStatus = (status: StationStatus) => {
    onFiltersChange({ ...filters, status: toggleStationStatusSelection(filters.status, status) });
  };

  const handleBandsChange = (bands: number[]) => {
    onFiltersChange({ ...filters, bands });
  };

  const handleClearFilters = () => {
    onClearAllFilters();
  };

  const regionChipsRef = useRef<HTMLDivElement>(null);
  const bandChipsRef = useRef<HTMLDivElement>(null);

  return (
    <aside className={cn("flex h-full shrink-0 flex-col overflow-visible", isSheet ? "w-full" : "w-72 border-r bg-muted/20")}>
      <div className="relative z-20 shrink-0 px-3 pt-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("common:labels.search")}</span>
        <search ref={containerRef} onBlur={handleContainerBlur} className="relative">
          <div className={cn("rounded-lg border bg-background transition-all", isFocused && "ring-2 ring-primary/20 border-primary/30")}>
            <div className="flex items-center gap-1 px-3 py-2">
              <HugeiconsIcon icon={Search02Icon} className="size-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-1 flex-1 flex-wrap">
                {parsedFilters.map((filter, index) => (
                  <div
                    key={filter.raw}
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium border shrink-0",
                      focusedChipIndex === index ? "border-primary ring-2 ring-primary/30" : "border-primary/20",
                    )}
                  >
                    <span className="font-mono text-[10px]">{filter.key}:</span>
                    <span className="text-[10px] max-w-20 truncate" title={filter.value}>
                      {filter.value}
                    </span>
                    <button onClick={() => removeFilter(filter)} className="hover:bg-primary/20 rounded p-0.5 transition-colors" type="button">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
                    </button>
                  </div>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  onClick={handleInputClick}
                  onKeyDown={handleKeyDown}
                  placeholder={parsedFilters.length > 0 ? "" : t("common:placeholder.search")}
                  className="flex-1 min-w-16 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              {(inputValue || parsedFilters.length > 0) && (
                <button type="button" onClick={handleClearSearch} className="p-0.5 hover:bg-muted rounded transition-colors shrink-0">
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
          {activeOverlay === "autocomplete" && autocompleteOptions.length > 0 && (
            <div className={cn("absolute top-full z-50 mt-1 [&>div]:mt-0", isSheet ? "inset-x-0" : "left-0 w-105 max-w-[calc(100vw-2rem)]")}>
              <AutocompleteDropdown options={autocompleteOptions} onSelect={applyAutocomplete} />
            </div>
          )}
        </search>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 px-3 pt-4 pb-3">
          <Separator />

          {!isSheet && (
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">{t("common:labels.filters")}</h2>
              {hasActiveFilters ? (
                <button type="button" onClick={handleClearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {t("common:actions.clearAll")}
                </button>
              ) : null}
            </div>
          )}
          {isSheet && hasActiveFilters ? (
            <button type="button" onClick={handleClearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("common:actions.clearAll")}
            </button>
          ) : null}

          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("common:labels.operator")}</span>
            <div className="space-y-0.5">
              {topOperators.map((op) => (
                <label
                  htmlFor={`operator-${op.mnc}`}
                  key={op.mnc}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors",
                    filters.operators.includes(op.mnc) ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <UICheckbox
                    id={`operator-${op.mnc}`}
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
                        htmlFor={`operator-${op.mnc}`}
                        key={op.mnc}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors",
                          filters.operators.includes(op.mnc) ? "bg-primary/10" : "hover:bg-muted",
                        )}
                      >
                        <UICheckbox
                          id={`operator-${op.mnc}`}
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
                  <ComboboxEmpty>{t("common:placeholder.noRegionsFound")}</ComboboxEmpty>
                  {regions.map((region) => (
                    <ComboboxItem key={region.id} value={region}>
                      {region.name}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("common:labels.standard")}</span>
            <div className="grid grid-cols-2 gap-0.5">
              {RAT_OPTIONS.map((rat) => (
                <label
                  htmlFor={`rat-${rat.value}`}
                  key={rat.value}
                  className={cn(
                    "flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer transition-colors",
                    filters.rat.includes(rat.value) ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <UICheckbox id={`rat-${rat.value}`} checked={filters.rat.includes(rat.value)} onCheckedChange={() => handleToggleRat(rat.value)} />
                  <span className="text-[10px] text-muted-foreground font-mono">{rat.gen}</span>
                  <span className="text-xs">{rat.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{t("common:labels.band")} (MHz)</span>
            <Combobox multiple value={filters.bands} onValueChange={handleBandsChange} items={uniqueBandValues}>
              <ComboboxChips ref={bandChipsRef} className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm">
                {visibleSelectedBands.map((band) => (
                  <ComboboxChip key={band}>{band === 0 ? t("stations:cells.unknownBand") : band}</ComboboxChip>
                ))}
                {hiddenSelectedBandCount > 0 ? (
                  <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                    +{hiddenSelectedBandCount}
                  </ComboboxChip>
                ) : null}
                <ComboboxChipsInput
                  className={filters.bands.length === 0 ? "min-w-0" : "min-w-2 w-2 flex-none"}
                  placeholder={filters.bands.length === 0 ? t("common:placeholder.selectBand") : ""}
                />
              </ComboboxChips>
              <ComboboxContent anchor={bandChipsRef}>
                <ComboboxList>
                  <ComboboxEmpty>{t("common:placeholder.noBandsFound")}</ComboboxEmpty>
                  {uniqueBandValues.map((band) => (
                    <ComboboxItem key={band} value={band}>
                      <span className="font-mono">{band === 0 ? t("stations:cells.unknownBand") : band}</span>
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <StationStatusFilter filters={filters} onToggleStatus={handleToggleStatus} />

          <div className="text-xs text-muted-foreground pt-2 border-t">
            {totalStations !== undefined
              ? t("main:filters.showingStationsOfTotal", { count: stationCount, total: totalStations })
              : t("main:filters.showingStations", { count: stationCount })}
          </div>
        </div>
      </div>
    </aside>
  );
}

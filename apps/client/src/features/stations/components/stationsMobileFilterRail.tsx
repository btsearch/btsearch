import { Cancel01Icon, CheckmarkCircle02Icon, DatabaseIcon, FullSignalIcon, Radar01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { AutocompleteDropdown } from "@/features/map/components/search-overlay/autocompleteDropdown";
import { RAT_OPTIONS } from "@/features/map/constants";
import { getAutocompleteMatches, replaceLastSearchToken } from "@/features/map/searchAutocomplete";
import { MobileOperatorFilterChip, MobileRegionFilterChip, sortBandsUnknownLast } from "@/features/shared/filterPanel";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { cn, toggleValue } from "@/lib/utils";
import type { StationStatus } from "@/types/station";

import { getStationStatusFilterCount, toggleStationStatusSelection } from "../stationStatus";
import { STATIONS_FILTER_KEYWORDS, type StationsFilterControlProps } from "./stationFilterOptions";
import { StationStatusFilter } from "./stationStatusFilter";

type StationsMobileFilterRailProps = StationsFilterControlProps & {
  hasActiveFilters: boolean;
  stationCount: number;
  totalStations?: number;
};

export function StationsMobileFilterRail({
  filters,
  operators,
  regions,
  uniqueBandValues,
  selectedRegions,
  searchQuery,
  onFiltersChange,
  onRegionsChange,
  onClearAllFilters,
  onSearchQueryChange,
  hasActiveFilters,
  stationCount,
  totalStations,
}: StationsMobileFilterRailProps) {
  const { t } = useTranslation(["stations", "common", "main"]);
  const bandValues = useMemo(() => sortBandsUnknownLast(uniqueBandValues), [uniqueBandValues]);
  const statusFilterCount = getStationStatusFilterCount(filters.status);
  const hasSearch = searchQuery.trim().length > 0;
  const [showSearchAutocomplete, setShowSearchAutocomplete] = useState(false);
  const searchAutocompleteOptions = useMemo(() => getAutocompleteMatches(searchQuery, STATIONS_FILTER_KEYWORDS), [searchQuery]);

  const handleAutocompleteSelect = (keyword: string) => {
    onSearchQueryChange(replaceLastSearchToken(searchQuery, keyword));
    setShowSearchAutocomplete(false);
  };

  const handleToggleStatus = (status: StationStatus) => {
    onFiltersChange((current) => ({ ...current, status: toggleStationStatusSelection(current.status, status) }));
  };

  const handleClearFilters = () => {
    onClearAllFilters();
    setShowSearchAutocomplete(false);
  };

  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label={t("common:labels.filters")}>
      <MobileFilterChip
        active={hasSearch}
        icon={Search01Icon}
        label={t("common:labels.search")}
        contentClassName="overflow-visible"
        onOpenChange={(open) => {
          if (!open) setShowSearchAutocomplete(false);
        }}
      >
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={searchQuery}
            onChange={(event) => {
              onSearchQueryChange(event.currentTarget.value);
              setShowSearchAutocomplete(true);
            }}
            onFocus={() => setShowSearchAutocomplete(true)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (!event.currentTarget.parentElement?.contains(nextTarget)) setShowSearchAutocomplete(false);
            }}
            placeholder={t("common:placeholder.search")}
            autoComplete="off"
            aria-label={t("common:labels.search")}
            className="h-9 w-full rounded-md border bg-background py-2 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => {
                onSearchQueryChange("");
                setShowSearchAutocomplete(false);
              }}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
          {showSearchAutocomplete && searchAutocompleteOptions.length > 0 ? (
            <div className="absolute bottom-full left-0 z-10 mb-2 w-full [&>div]:mt-0">
              <AutocompleteDropdown options={searchAutocompleteOptions} onSelect={handleAutocompleteSelect} />
            </div>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileOperatorFilterChip
        operators={operators}
        selectedMncs={filters.operators}
        onToggle={(mnc) => onFiltersChange((current) => ({ ...current, operators: toggleValue(current.operators, mnc) }))}
      />

      <MobileRegionFilterChip
        regions={regions}
        selectedRegions={selectedRegions}
        onToggle={(regionId) => onRegionsChange((current) => toggleValue(current, regionId))}
      />

      <MobileFilterChip active={filters.rat.length > 0} count={filters.rat.length} icon={FullSignalIcon} label={t("common:labels.standard")}>
        <MobileFilterPanelTitle>{t("common:labels.standard")}</MobileFilterPanelTitle>
        <div className="grid grid-cols-2 gap-1">
          {RAT_OPTIONS.map((rat) => {
            const selected = filters.rat.includes(rat.value);
            return (
              <button
                key={rat.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onFiltersChange((current) => ({ ...current, rat: toggleValue(current.rat, rat.value) }))}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-2 text-left transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <GenerationTag active={selected}>{rat.gen}</GenerationTag>
                <span className="text-xs font-medium">{rat.label}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={filters.bands.length > 0} count={filters.bands.length} icon={Radar01Icon} label={t("common:labels.band")}>
        <MobileFilterPanelTitle>{t("common:labels.band")} (MHz)</MobileFilterPanelTitle>
        <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">
          {bandValues.map((band) => {
            const selected = filters.bands.includes(band);
            return (
              <button
                key={band}
                type="button"
                aria-pressed={selected}
                onClick={() => onFiltersChange((current) => ({ ...current, bands: toggleValue(current.bands, band) }))}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-2.5 font-mono text-xs transition-colors",
                  selected ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
                )}
              >
                {band === 0 ? t("stations:cells.unknownBand") : band}
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={statusFilterCount > 0} count={statusFilterCount} icon={CheckmarkCircle02Icon} label={t("main:filters.stationStatus")}>
        <StationStatusFilter filters={filters} onToggleStatus={handleToggleStatus} />
      </MobileFilterChip>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={handleClearFilters}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}

      <div className="inline-flex h-8 max-w-44 shrink-0 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={DatabaseIcon} className="mr-1.5 size-3.5 shrink-0" />
        <span className="truncate">
          {totalStations !== undefined
            ? t("main:filters.showingStationsOfTotal", { count: stationCount, total: totalStations })
            : t("main:filters.showingStations", { count: stationCount })}
        </span>
      </div>
    </div>
  );
}

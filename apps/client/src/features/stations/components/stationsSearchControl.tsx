import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { AutocompleteDropdown } from "@/features/map/components/search-overlay/autocompleteDropdown";
import { parseFilters } from "@/features/map/filters";
import { useSearchState } from "@/features/map/hooks/useSearchState";
import { FilterSearchInput, FilterSearchShell } from "@/features/shared/filterPanel";
import { cn } from "@/lib/utils";

import { STATIONS_FILTER_KEYWORDS } from "./stationFilterOptions";

type StationsSearchControlProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  placeholder: string;
  className?: string;
};

export function StationsSearchControl({ searchQuery, onSearchQueryChange, placeholder, className }: StationsSearchControlProps) {
  const { t } = useTranslation("common");
  const {
    inputValue,
    parsedFilters,
    autocompleteOptions,
    activeOverlay,
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
    externalQuery: searchQuery,
    onQueryChange: onSearchQueryChange,
  });
  const hasValue = inputValue.length > 0 || parsedFilters.length > 0;

  return (
    <FilterSearchShell
      containerRef={containerRef}
      onBlur={handleContainerBlur}
      hasValue={hasValue}
      onClear={clearSearch}
      className={className}
      overlay={
        activeOverlay === "autocomplete" && autocompleteOptions.length > 0 ? (
          <div className="absolute left-0 top-full z-50 mt-1 w-105 max-w-[calc(100vw-1.5rem)] [&>div]:mt-0">
            <AutocompleteDropdown options={autocompleteOptions} onSelect={applyAutocomplete} />
          </div>
        ) : null
      }
    >
      {parsedFilters.map((filter, index) => (
        <span
          key={`${filter.raw}:${index}`}
          className={cn(
            "flex h-5 shrink-0 items-center gap-0.5 rounded-sm bg-primary/10 pl-1.5 text-xs font-medium text-primary",
            focusedChipIndex === index ? "ring-2 ring-ring/60" : null,
          )}
        >
          <span className="font-mono">{filter.key}:</span>
          <span className="max-w-28 truncate" title={filter.value}>
            {filter.value}
          </span>
          <button
            type="button"
            onClick={() => removeFilter(filter)}
            className="inline-flex size-5 items-center justify-center rounded-sm opacity-60 transition-opacity hover:opacity-100"
            aria-label={`${t("actions.clear")} ${filter.key}: ${filter.value}`}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </button>
        </span>
      ))}
      <FilterSearchInput
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onClick={handleInputClick}
        onKeyDown={handleKeyDown}
        placeholder={parsedFilters.length > 0 ? "" : placeholder}
        aria-label={t("labels.search")}
      />
    </FilterSearchShell>
  );
}

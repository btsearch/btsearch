import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type KeyboardEvent, useId } from "react";
import { useTranslation } from "react-i18next";

import { SearchAssistPanel } from "@/features/map/components/search-overlay/searchAssist";
import { type AssistSearchOption, isAssistSearchOption } from "@/features/map/components/search-overlay/searchOptions";
import { useSearchAssistOptions } from "@/features/map/components/search-overlay/useSearchAssistOptions";
import { useSearchNavigation } from "@/features/map/components/search-overlay/useSearchNavigation";
import { FILTER_KEYWORDS } from "@/features/map/constants";
import { parseFilters } from "@/features/map/filters";
import { useSearchState } from "@/features/map/hooks/useSearchState";
import { FilterSearchInput, FilterSearchShell } from "@/features/shared/filterPanel";
import { cn } from "@/lib/utils";

type StationsSearchControlProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  placeholder: string;
  describedBy?: string;
  className?: string;
};

export const STATIONS_FILTER_KEYWORDS = FILTER_KEYWORDS.filter((keyword) => keyword.availableOn.includes("stations"));
const NO_OPTIONS: AssistSearchOption[] = [];

export function StationsSearchControl({ searchQuery, onSearchQueryChange, placeholder, describedBy, className }: StationsSearchControlProps) {
  const { t } = useTranslation(["common", "main"]);
  const listboxId = useId();
  const {
    query,
    inputValue,
    parsedFilters,
    assist,
    isPickerOpen,
    invalidChipIndexes,
    activeOverlay,
    containerRef,
    inputRef,
    focusedChipIndex,
    handleContainerBlur,
    handleInputChange,
    handleInputFocus,
    handleInputClick,
    handleKeyDown: handleChipKeyDown,
    selectAssistOption,
    openChipPicker,
    goBack,
    forgetRecent,
    clearSearch,
    removeFilter,
    openOverlay,
    closeOverlay,
  } = useSearchState({
    filterKeywords: STATIONS_FILTER_KEYWORDS,
    parseFilters,
    recentScope: "stations",
    externalQuery: searchQuery,
    onQueryChange: onSearchQueryChange,
    resultsEnabled: false,
  });
  const { options, areValuesLoading } = useSearchAssistOptions(assist);
  const showAssist = activeOverlay === "assist" && assist !== null && (assist.view === "values" || options.length > 0);
  const navigation = useSearchNavigation(
    showAssist ? options : NO_OPTIONS,
    listboxId,
    `${isPickerOpen ? `picker:${inputValue}` : query}:${assist?.view ?? ""}`,
  );
  const hasValue = inputValue.length > 0 || parsedFilters.length > 0;

  function selectOption(option: AssistSearchOption | undefined) {
    if (!option) return;
    if (option.kind !== "value") navigation.reset();
    selectAssistOption(option);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    handleChipKeyDown(event);
    if (event.defaultPrevented) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showAssist) {
        openOverlay();
        return;
      }
      event.preventDefault();
      navigation.move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" && showAssist) {
      const option = navigation.activeOption ?? (assist?.view === "values" ? options[0] : undefined);
      if (option === undefined || !isAssistSearchOption(option)) return;
      event.preventDefault();
      selectOption(option);
      return;
    }
    const activeOption = navigation.activeOption;
    if (event.key === "Delete" && event.shiftKey && activeOption?.kind === "recent") {
      event.preventDefault();
      forgetRecent(activeOption.query);
      return;
    }
    if (event.key === "Escape" && activeOverlay) {
      event.preventDefault();
      navigation.reset();
      closeOverlay();
    }
  }

  return (
    <FilterSearchShell
      containerRef={containerRef}
      onBlur={handleContainerBlur}
      hasValue={hasValue}
      onClear={clearSearch}
      className={className}
      overlay={
        showAssist ? (
          <div className="absolute left-0 top-full z-50 mt-1 w-105 max-w-[calc(100vw-1.5rem)] [&>div]:mt-0">
            <SearchAssistPanel
              assist={assist}
              options={options}
              areValuesLoading={areValuesLoading}
              listboxId={listboxId}
              activeKey={navigation.activeKey}
              onActiveKeyChange={navigation.setActiveKey}
              onSelect={selectOption}
              onForgetRecent={forgetRecent}
              onBack={goBack}
            />
          </div>
        ) : null
      }
    >
      {parsedFilters.map((filter, index) => (
        <span
          key={`${filter.raw}:${index}`}
          className={cn(
            "flex h-5 shrink-0 items-center gap-0.5 rounded-sm pl-1.5 text-xs font-medium",
            invalidChipIndexes.has(index) ? "bg-destructive/10 ring-1 ring-destructive" : "bg-primary/10",
            focusedChipIndex === index && "ring-2 ring-ring/60",
          )}
        >
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => openChipPicker(index)}
            aria-label={t("main:search.editFilter", { filter: `${filter.key}: ${filter.value}` })}
            className="flex cursor-pointer items-center gap-0.5"
          >
            <span className="font-mono text-muted-foreground">{filter.key}:</span>
            <span className="max-w-28 truncate text-foreground" title={filter.value}>
              {filter.value.split(",").join(", ")}
            </span>
          </button>
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
        role="combobox"
        aria-label={t("labels.search")}
        aria-autocomplete="list"
        aria-expanded={showAssist}
        aria-controls={showAssist ? `${listboxId}-assist` : undefined}
        aria-activedescendant={showAssist ? navigation.activeOptionId : undefined}
        aria-invalid={describedBy === undefined ? undefined : true}
        aria-describedby={describedBy}
      />
    </FilterSearchShell>
  );
}

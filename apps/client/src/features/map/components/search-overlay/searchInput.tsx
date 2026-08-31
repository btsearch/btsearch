import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/ui/spinner.js";
import { cn } from "@/lib/utils.js";

import type { ParsedFilter } from "../../types.js";

type SearchInputProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  parsedFilters: ParsedFilter[];
  focusedChipIndex?: number | null;
  isBusy: boolean;
  query: string;
  isFocused: boolean;
  isMobile: boolean;
  mobileExpanded: boolean;
  listboxId?: string;
  activeOptionId?: string;
  isExpanded: boolean;
  filterSlot?: ReactNode;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onInputFocus: () => void;
  onInputClick: () => void;
  onRemoveFilter: (filter: ParsedFilter) => void;
  onClearSearch: () => void;
  onMobileExpand: () => void;
  mode: "results" | "map";
  showModeControl: boolean;
  onModeChange: (mode: "results" | "map") => void;
};

export function SearchInput({
  inputRef,
  inputValue,
  parsedFilters,
  focusedChipIndex = null,
  isBusy,
  query,
  isFocused,
  isMobile,
  mobileExpanded,
  listboxId,
  activeOptionId,
  isExpanded,
  filterSlot,
  onInputChange,
  onKeyDown,
  onInputFocus,
  onInputClick,
  onRemoveFilter,
  onClearSearch,
  onMobileExpand,
  mode,
  showModeControl,
  onModeChange,
}: SearchInputProps) {
  const { t } = useTranslation(["main", "common"]);

  function handleMobileSearchClick() {
    onMobileExpand();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div
      className={cn(
        "bg-background/95 backdrop-blur-md border rounded-2xl shadow-xl transition-all duration-200",
        isFocused && "ring-2 ring-primary/20 border-primary/30",
        !mobileExpanded && !isFocused && "md:w-auto w-fit ml-auto",
      )}
    >
      <div className="flex flex-nowrap items-center gap-1.5 px-2.5 py-2 md:gap-2 md:px-3">
        <button
          type="button"
          tabIndex={isMobile ? 0 : -1}
          className="relative shrink-0 rounded-lg outline-none after:absolute after:-inset-x-3 after:-inset-y-2 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring/60 max-md:py-1 md:pointer-events-none md:after:hidden"
          onClick={handleMobileSearchClick}
          aria-label={t("common:actions.search")}
        >
          <HugeiconsIcon icon={Search01Icon} className="size-5 text-muted-foreground" />
        </button>

        <div
          className={cn("scrollbar-hide flex min-w-0 flex-1 items-center gap-2 overflow-x-auto", !mobileExpanded && !isFocused && "hidden md:flex")}
        >
          {parsedFilters.map((filter, index) => (
            <div
              key={filter.raw}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-lg text-sm font-medium border shrink-0",
                focusedChipIndex === index ? "border-primary ring-2 ring-primary/30" : "border-primary/20",
              )}
            >
              <span className="font-mono text-xs whitespace-nowrap">{filter.key}:</span>
              <span className="text-xs whitespace-nowrap max-w-30 truncate" title={filter.value}>
                {filter.value}
              </span>
              <button
                onClick={() => onRemoveFilter(filter)}
                className="ml-0.5 flex shrink-0 items-center justify-center rounded p-0.5 transition-colors hover:bg-primary/20 max-md:size-6 max-md:p-0"
                type="button"
                aria-label={`${t("common:actions.clear")} ${filter.key}:${filter.value}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              </button>
            </div>
          ))}

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            onFocus={onInputFocus}
            onClick={onInputClick}
            placeholder={parsedFilters.length > 0 ? t("search.placeholderAddMore") : t("common:placeholder.search")}
            role="combobox"
            aria-label={t("search.accessibleLabel")}
            aria-autocomplete="list"
            aria-expanded={isExpanded}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60 md:min-w-25 md:text-sm"
          />
        </div>

        {isFocused && showModeControl ? (
          <div
            role="group"
            aria-label={t("search.modeLabel")}
            className="flex h-6 shrink-0 items-center rounded-lg border border-border/70 bg-muted/40 p-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-150"
          >
            <button
              type="button"
              aria-pressed={mode === "results"}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onModeChange("results")}
              className={cn(
                "relative flex h-5 items-center rounded-md px-1.5 text-[10px] font-semibold leading-none text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:px-2 md:text-[11px]",
                mode === "results" && "bg-background text-foreground shadow-sm",
              )}
            >
              {t("search.modeResults")}
            </button>
            <button
              type="button"
              aria-pressed={mode === "map"}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onModeChange("map")}
              className={cn(
                "relative flex h-5 items-center rounded-md px-1.5 text-[10px] font-semibold leading-none text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:px-2 md:text-[11px]",
                mode === "map" && "bg-background text-foreground shadow-sm",
              )}
            >
              {t("search.modeMap")}
            </button>
          </div>
        ) : null}

        {isBusy && query.trim() !== "" ? <Spinner className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}

        {(query || parsedFilters.length > 0) && !isBusy ? (
          <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={onClearSearch}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 outline-none transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-w-11 md:after:hidden",
              !mobileExpanded && !isFocused && "hidden md:block",
            )}
            type="button"
            aria-label={t("common:actions.clear")}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" />
          </button>
        ) : null}

        {filterSlot}
      </div>
    </div>
  );
}

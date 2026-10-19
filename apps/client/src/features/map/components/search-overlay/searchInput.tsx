import { AlertCircleIcon, Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type KeyboardEvent, type ReactNode, type RefObject, useId } from "react";
import { useTranslation } from "react-i18next";

import type { QueryProblem } from "../../searchAutocomplete";
import type { ParsedFilter } from "../../types";
import { Reveal } from "./mapFilterMotion";
import { SearchProblemNote } from "./searchProblemNote";
import { Spinner } from "@/components/ui/spinner";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type SearchInputProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  inputValue: string;
  parsedFilters: ParsedFilter[];
  focusedChipIndex?: number | null;
  invalidChipIndexes: ReadonlySet<number>;
  isBusy: boolean;
  isQueryRejected: boolean;
  queryProblem: QueryProblem | null;
  query: string;
  isFocused: boolean;
  isMobile: boolean;
  mobileExpanded: boolean;
  listboxId?: string;
  activeOptionId?: string;
  isExpanded: boolean;
  filterSlot?: ReactNode;
  mobileControls?: ReactNode;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onInputFocus: () => void;
  onInputClick: () => void;
  onRemoveFilter: (filter: ParsedFilter) => void;
  onEditFilter: (index: number) => void;
  onFixQuery: () => void;
  onClearSearch: () => void;
  onMobileExpand: () => void;
  mode: "results" | "map";
  showModeControl: boolean;
  onModeChange: (mode: "results" | "map") => void;
};

type SearchModeControlProps = Pick<SearchInputProps, "mode" | "onModeChange">;

const MODE_CONTROL_CLASS = "flex h-6 shrink-0 items-center rounded-lg border border-border/70 bg-muted/40 p-0";
const MODE_BUTTON_CLASS =
  "relative flex h-5 cursor-pointer items-center rounded-md px-1.5 text-[10px] font-semibold leading-none text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:px-2 md:text-[11px]";
const MODE_BUTTON_ACTIVE_CLASS = "bg-background text-foreground shadow-sm";

function SearchModeControl({ mode, onModeChange }: SearchModeControlProps) {
  const { t } = useTranslation(["main", "common"]);

  return (
    <div role="group" aria-label={t("search.modeLabel")} className={MODE_CONTROL_CLASS}>
      <button
        type="button"
        aria-pressed={mode === "results"}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onModeChange("results")}
        className={cn(MODE_BUTTON_CLASS, mode === "results" && MODE_BUTTON_ACTIVE_CLASS)}
      >
        {t("search.modeResults")}
      </button>
      <button
        type="button"
        aria-pressed={mode === "map"}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => onModeChange("map")}
        className={cn(MODE_BUTTON_CLASS, mode === "map" && MODE_BUTTON_ACTIVE_CLASS)}
      >
        {t("common:labels.map")}
      </button>
    </div>
  );
}

export function SearchInput({
  inputRef,
  inputValue,
  parsedFilters,
  focusedChipIndex = null,
  invalidChipIndexes,
  isBusy,
  isQueryRejected,
  queryProblem,
  query,
  isFocused,
  isMobile,
  mobileExpanded,
  listboxId,
  activeOptionId,
  isExpanded,
  filterSlot,
  mobileControls,
  onInputChange,
  onKeyDown,
  onInputFocus,
  onInputClick,
  onRemoveFilter,
  onEditFilter,
  onFixQuery,
  onClearSearch,
  onMobileExpand,
  mode,
  showModeControl,
  onModeChange,
}: SearchInputProps) {
  const { t } = useTranslation(["main", "common"]);
  const rejectedQueryNoteId = useId();
  const hasQueryNote = queryProblem !== null || isQueryRejected;

  function handleMobileSearchClick() {
    onMobileExpand();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className={cn("relative", !mobileExpanded && !isFocused && "md:w-auto w-fit ml-auto")}>
      <div className="flex flex-nowrap items-center gap-1.5 px-2.5 py-2 md:gap-2 md:px-3">
        <button
          type="button"
          tabIndex={isMobile ? 0 : -1}
          className="relative shrink-0 cursor-pointer rounded-lg outline-none after:absolute after:-inset-x-3 after:-inset-y-2 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring/60 max-md:py-1 md:pointer-events-none md:after:hidden"
          onClick={handleMobileSearchClick}
          aria-label={t("common:actions.search")}
        >
          <HugeiconsIcon icon={Search01Icon} className="size-5 text-muted-foreground" aria-hidden="true" />
        </button>

        <div
          className={cn("scrollbar-hide flex min-w-0 flex-1 items-center gap-2 overflow-x-auto", !mobileExpanded && !isFocused && "hidden md:flex")}
        >
          {parsedFilters.map((filter, index) => (
            <div
              key={`${filter.raw}:${index}`}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium border shrink-0",
                invalidChipIndexes.has(index) ? "bg-destructive/10" : "bg-primary/10",
                invalidChipIndexes.has(index) && focusedChipIndex !== index && "border-destructive",
                focusedChipIndex === index && "border-primary ring-2 ring-primary/30",
                !invalidChipIndexes.has(index) && focusedChipIndex !== index && "border-primary/20",
              )}
            >
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onEditFilter(index)}
                aria-label={t("search.editFilter", { filter: `${filter.key}: ${filter.value}` })}
                className="inline-flex cursor-pointer items-center gap-1 rounded outline-none"
              >
                <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">{filter.key}:</span>
                <span className="text-xs whitespace-nowrap max-w-30 truncate text-foreground" title={filter.value}>
                  {filter.value.split(",").join(", ")}
                </span>
              </button>
              <button
                onClick={() => onRemoveFilter(filter)}
                className="ml-0.5 flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 transition-colors hover:bg-primary/20 max-md:size-6 max-md:p-0"
                type="button"
                aria-label={`${t("common:actions.clear")} ${filter.key}:${filter.value}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" aria-hidden="true" />
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
            aria-invalid={hasQueryNote || undefined}
            aria-describedby={hasQueryNote ? rejectedQueryNoteId : undefined}
            {...NO_AUTOFILL_PROPS}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60 md:min-w-25 md:text-sm"
          />
        </div>

        {isBusy && query.trim() !== "" ? <Spinner className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}

        {(query || parsedFilters.length > 0) && !isBusy ? (
          <button
            onPointerDown={(e) => e.preventDefault()}
            onClick={onClearSearch}
            className={cn(
              "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-1.5 outline-none transition-colors after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-w-11 md:after:hidden",
              !mobileExpanded && !isFocused && "hidden md:block",
            )}
            type="button"
            aria-label={t("common:actions.clear")}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : null}

        {filterSlot}
      </div>

      <Reveal shown={isFocused && showModeControl}>
        <div className="flex items-center justify-end gap-2 px-2.5 pb-2 md:px-3">
          <span className="text-[11px] leading-4 text-muted-foreground">{t("search.modeShow")}</span>
          <SearchModeControl mode={mode} onModeChange={onModeChange} />
        </div>
      </Reveal>

      <div role="status" className={!mobileExpanded && !isFocused ? "max-md:hidden" : undefined}>
        <Reveal shown={hasQueryNote}>
          {queryProblem === null ? (
            <p
              id={rejectedQueryNoteId}
              className="flex items-start gap-1.5 px-2.5 pb-2 text-xs leading-4 font-medium text-foreground md:gap-2 md:px-3"
            >
              <span className="flex h-4 w-5 shrink-0 items-center justify-center">
                <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 text-destructive" aria-hidden="true" />
              </span>
              <span className="min-w-0">{t("search.queryRejected")}</span>
            </p>
          ) : (
            <SearchProblemNote id={rejectedQueryNoteId} problem={queryProblem} onFix={onFixQuery} className="pr-2 pb-2 pl-3 md:pl-3.5" />
          )}
        </Reveal>
      </div>
      {mobileControls ? <div className="absolute top-full right-0 mt-2">{mobileControls}</div> : null}
    </div>
  );
}

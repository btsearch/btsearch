import { ArrowLeft01Icon, ArrowRight01Icon, Clock01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { enUS, pl } from "date-fns/locale";
import type { PointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { parseFilters } from "../../filters";
import { isSingleValueKeyword } from "../../searchAutocomplete";
import { formatSearchDate } from "../../searchValues";
import type { FilterKeyword, SearchAssist } from "../../types";
import { type AssistSearchOption, FILTER_GROUP_ORDER, getSearchOptionId } from "./searchOptions";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CloseButton } from "@/components/ui/close-button";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Spinner } from "@/components/ui/spinner";
import { KbdHint } from "@/features/shared/filterPanel";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type SearchAssistProps = {
  assist: SearchAssist;
  options: AssistSearchOption[];
  areValuesLoading: boolean;
  listboxId: string;
  activeKey: string | null;
  embedded?: boolean;
  withFooter?: boolean;
  onActiveKeyChange: (key: string) => void;
  onSelect: (option: AssistSearchOption) => void;
  onForgetRecent: (query: string) => void;
  onBack: () => void;
};

type OptionRowProps = {
  option: AssistSearchOption;
  listboxId: string;
  activeKey: string | null;
  checked?: boolean;
  className?: string;
  onActiveKeyChange: (key: string) => void;
  onSelect: (option: AssistSearchOption) => void;
  children: ReactNode;
};

const SECTION_LABEL_CLASS = "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const HINT_EXAMPLES: Partial<Record<FilterKeyword["valueKind"], string>> = { number: "125432, 0x1EA58", gps: "52.2297,21.0122" };

function keepInputFocus(event: PointerEvent) {
  event.preventDefault();
}

function formatFilterValue(value: string): string {
  return value.split(",").join(", ");
}

function OptionRow({ option, listboxId, activeKey, checked, className, onActiveKeyChange, onSelect, children }: OptionRowProps) {
  const isActive = activeKey === option.key;

  return (
    <button
      id={getSearchOptionId(listboxId, option.key)}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={checked ?? isActive}
      onPointerEnter={() => {
        if (!isActive) onActiveKeyChange(option.key);
      }}
      onPointerDown={keepInputFocus}
      onClick={() => onSelect(option)}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors md:min-h-10",
        isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/70",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FilterToken({ name, value }: { name: string; value: string }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-xs whitespace-nowrap">
      <span className="font-mono text-muted-foreground">{name}:</span>
      <span className="font-medium text-foreground">{formatFilterValue(value)}</span>
    </span>
  );
}

function KeyHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="hidden items-center gap-1.5 md:inline-flex">
      <KbdHint>{keys}</KbdHint>
      {label}
    </span>
  );
}

function KeywordRowContent({ keyword, wide = false, showExample = false }: { keyword: FilterKeyword; wide?: boolean; showExample?: boolean }) {
  const { t } = useTranslation("main");

  return (
    <>
      <span className={cn("shrink-0 truncate font-mono text-sm font-semibold text-primary", wide ? "w-44" : "w-28")}>{keyword.key}</span>
      <span className="min-w-0 flex-1 truncate text-xs leading-4 text-muted-foreground">{t(`autocomplete.filters.${keyword.descriptionKey}`)}</span>
      {showExample && keyword.example !== undefined ? (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{keyword.example}</span>
      ) : null}
    </>
  );
}

export function SearchAssistPanel({
  assist,
  options,
  areValuesLoading,
  listboxId,
  activeKey,
  embedded = false,
  withFooter = true,
  onActiveKeyChange,
  onSelect,
  onForgetRecent,
  onBack,
}: SearchAssistProps) {
  const { t, i18n } = useTranslation(["main", "common"]);
  const rowProps = { listboxId, activeKey, onActiveKeyChange, onSelect };
  const isValuesView = assist.view === "values";
  const isMulti = isValuesView && !isSingleValueKeyword(assist.keyword);

  function renderHome() {
    const filterOptions = options.filter((option) => option.kind === "filter");
    const allFiltersOption = options.find((option) => option.kind === "all-filters");
    const recentOptions = options.filter((option) => option.kind === "recent");

    return (
      <>
        <p className={SECTION_LABEL_CLASS}>{t("common:labels.filters")}</p>
        {filterOptions.map((option) => (
          <OptionRow key={option.key} option={option} {...rowProps}>
            <KeywordRowContent keyword={option.keyword} showExample />
          </OptionRow>
        ))}
        {allFiltersOption ? (
          <OptionRow option={allFiltersOption} {...rowProps} className="gap-2">
            <span className="text-[13px] font-medium">{t("autocomplete.allFilters")}</span>
            <span className="flex-1" />
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground" aria-hidden="true" />
          </OptionRow>
        ) : null}
        {recentOptions.length > 0 ? (
          <div className="mt-1.5 border-t border-border/60 pt-1.5">
            <p className={SECTION_LABEL_CLASS}>{t("autocomplete.recentSearches")}</p>
            {recentOptions.map((option) => {
              const { filters, remainingText } = parseFilters(option.query);
              return (
                <div key={option.key} className="flex items-center gap-0.5">
                  <OptionRow option={option} {...rowProps} className="min-w-0 flex-1 gap-2 overflow-hidden">
                    <HugeiconsIcon icon={Clock01Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {filters.map((filter) => (
                      <FilterToken key={filter.raw} name={filter.key} value={filter.value} />
                    ))}
                    <span className="min-w-0 truncate text-[13px]">{remainingText}</span>
                  </OptionRow>
                  <CloseButton
                    size="xs"
                    label={t("autocomplete.forgetRecent")}
                    tabIndex={-1}
                    onPointerDown={keepInputFocus}
                    onClick={() => onForgetRecent(option.query)}
                    className="mr-1.5 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </>
    );
  }

  function renderAll() {
    const filterOptions = options.filter((option) => option.kind === "filter");

    return (
      <>
        <div className="flex items-center gap-2 px-1 pb-1">
          <Button variant="ghost" size="icon-xs" aria-label={t("common:actions.back")} onPointerDown={keepInputFocus} onClick={onBack}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <span className="text-[13px] font-medium">{t("autocomplete.allFilters")}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{options.length}</span>
        </div>
        {FILTER_GROUP_ORDER.map((group) => {
          const groupOptions = filterOptions.filter((option) => option.keyword.group === group);
          if (groupOptions.length === 0) return null;
          const groupLabelId = `${listboxId}-group-${group}`;
          return (
            <div key={group} role="group" aria-labelledby={groupLabelId} className="not-first:pt-1.5">
              <p id={groupLabelId} className={SECTION_LABEL_CLASS}>
                {t(`autocomplete.groups.${group}`)}
              </p>
              {groupOptions.map((option) => (
                <OptionRow key={option.key} option={option} {...rowProps}>
                  <KeywordRowContent keyword={option.keyword} wide />
                </OptionRow>
              ))}
            </div>
          );
        })}
      </>
    );
  }

  function renderKeywords() {
    if (options.length === 0) return null;
    return (
      <>
        <p className={SECTION_LABEL_CLASS}>{t("common:labels.filters")}</p>
        {options.map((option) =>
          option.kind === "filter" ? (
            <OptionRow key={option.key} option={option} {...rowProps}>
              <KeywordRowContent keyword={option.keyword} />
            </OptionRow>
          ) : null,
        )}
      </>
    );
  }

  function renderValues(values: Extract<SearchAssist, { view: "values" }>) {
    const { keyword } = values;
    const hasGroups =
      new Set(options.flatMap((option) => (option.kind === "value" && option.option.group !== undefined ? [option.option.group] : []))).size > 1;
    const hintExample = HINT_EXAMPLES[keyword.valueKind] ?? (keyword.valueKind === "text" ? keyword.example : undefined);
    const showsHint = keyword.valueKind === "number" || keyword.valueKind === "text" || keyword.valueKind === "gps";
    const hasValueRows = options.some((option) => option.kind === "value" || option.kind === "typed-value");
    let previousGroup: string | undefined;

    return (
      <>
        {showsHint ? (
          <div className="m-1 rounded-lg bg-muted/30 px-3 py-2.5 text-xs leading-[18px] text-foreground">
            <p>{t(`autocomplete.hints.${keyword.valueKind}`)}</p>
            {hintExample === undefined ? null : (
              <p className="mt-1.5 text-muted-foreground">
                {t("autocomplete.example")}{" "}
                <span className="font-mono text-foreground">
                  {keyword.key} {hintExample}
                </span>
              </p>
            )}
          </div>
        ) : null}

        {areValuesLoading ? (
          <div className="flex justify-center p-6" role="status">
            <Spinner className="size-5 text-muted-foreground" aria-label={t("common:actions.loading")} />
          </div>
        ) : null}

        {options.map((option) => {
          if (option.kind === "typed-value") {
            return (
              <OptionRow key={option.key} option={option} {...rowProps} className="gap-2.5">
                <span className="text-[13px] text-muted-foreground">{t("autocomplete.insert")}</span>
                <FilterToken name={keyword.key.slice(0, -1)} value={option.value} />
                <span className="flex-1" />
                <KbdHint>Enter</KbdHint>
              </OptionRow>
            );
          }
          if (option.kind === "remove-filter") {
            return (
              <div key={option.key} className="mt-1.5 border-t border-border/60 pt-1.5">
                <OptionRow option={option} {...rowProps} className="gap-2.5 text-destructive">
                  <HugeiconsIcon icon={Delete02Icon} className="size-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium">{t("autocomplete.removeFilter")}</span>
                </OptionRow>
              </div>
            );
          }
          if (option.kind !== "value") return null;

          const { option: value, selected } = option;
          const groupLabel = hasGroups && value.group !== undefined && value.group !== previousGroup ? value.group : undefined;
          previousGroup = value.group;
          return (
            <div key={option.key}>
              {groupLabel === undefined ? null : (
                <p className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-xs text-muted-foreground">
                  <CountryCodeTile code={groupLabel} size="xs" />
                  {getCountryName(groupLabel, i18n.language)}
                </p>
              )}
              <OptionRow option={option} {...rowProps} checked={isMulti ? selected : undefined} className="gap-2.5">
                {isMulti ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-input dark:bg-input/30",
                    )}
                  >
                    {selected ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5" /> : null}
                  </span>
                ) : null}
                {value.brand === undefined ? null : <BrandMark brand={value.brand} size={16} />}
                {value.countryCode === undefined ? null : <CountryCodeTile code={value.countryCode} size="xs" />}
                <span className="min-w-0 truncate text-sm font-medium">{value.label}</span>
                {value.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-4 shrink-0 items-center rounded-[5px] bg-foreground/10 px-1 text-[9px] font-bold tracking-wide text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
                <span className="flex-1" />
                {value.code === null ? null : <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{value.code}</span>}
              </OptionRow>
            </div>
          );
        })}

        {keyword.valueKind === "date" ? (
          <div onPointerDown={keepInputFocus}>
            <Calendar
              mode="single"
              classNames={{ root: "w-full" }}
              className="bg-transparent [&_td]:aspect-auto [&_[data-day]]:aspect-auto [&_[data-day]]:h-8"
              locale={i18n.language === "pl-PL" ? pl : enUS}
              onSelect={(date) => {
                if (date) onSelect({ kind: "typed-value", key: "typed-value:calendar", value: formatSearchDate(date) });
              }}
            />
          </div>
        ) : null}

        {!areValuesLoading && !hasValueRows && !showsHint && keyword.valueKind !== "date" ? (
          <p role="status" className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            {t("autocomplete.noValues", { text: values.typed.trim() })}
          </p>
        ) : null}
      </>
    );
  }

  let content: ReactNode;
  switch (assist.view) {
    case "home":
      content = renderHome();
      break;
    case "all":
      content = renderAll();
      break;
    case "keywords":
      content = renderKeywords();
      break;
    case "values":
      content = renderValues(assist);
      break;
  }
  if (content === null) return null;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        embedded
          ? "border-t border-border/60"
          : "mt-2 max-h-[min(28rem,calc(100dvh-8rem-var(--floating-nav-map-offset,0rem)-var(--top-viewport-obstruction,0px)))] rounded-xl bg-background/95 shadow-lg ring-1 ring-foreground/10 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-150",
      )}
    >
      {isValuesView ? (
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-2">
          <Button variant="ghost" size="icon-xs" aria-label={t("common:actions.back")} onPointerDown={keepInputFocus} onClick={onBack}>
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <span className="shrink-0 font-mono text-[13px] font-semibold text-primary">{assist.keyword.key}</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{t(`autocomplete.filters.${assist.keyword.descriptionKey}`)}</span>
        </div>
      ) : null}

      <div className="custom-scrollbar min-h-0 overflow-y-auto overscroll-contain p-1.5">
        <div
          id={`${listboxId}-assist`}
          role="listbox"
          aria-label={isValuesView ? assist.keyword.key : t("autocomplete.availableFilters")}
          aria-multiselectable={isMulti || undefined}
        >
          {content}
        </div>
      </div>

      {withFooter ? (
        <div
          className={cn(
            "flex items-center gap-3.5 border-t border-border/60 py-1.5 pr-2 pl-4 text-[11px] leading-4 text-muted-foreground",
            !isMulti && "max-md:hidden",
          )}
        >
          <KeyHint keys="↑↓" label={t("autocomplete.keys.choose")} />
          <KeyHint keys="Enter" label={isMulti ? t("autocomplete.keys.toggle") : t("autocomplete.keys.insert")} />
          {isMulti ? <KeyHint keys={t("autocomplete.keys.space")} label={t("autocomplete.keys.finish")} /> : null}
          <KeyHint keys="Esc" label={isValuesView ? t("common:actions.back") : t("common:actions.close")} />
          {isMulti ? (
            <Button variant="ghost" size="xs" className="ml-auto" onPointerDown={keepInputFocus} onClick={onBack}>
              {t("common:actions.done")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

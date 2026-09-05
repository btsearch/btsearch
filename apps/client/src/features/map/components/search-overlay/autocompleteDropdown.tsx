import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { FilterKeyword } from "../../types";
import { getSearchOptionId } from "./searchOptions";

const FILTER_GROUP_ORDER: FilterKeyword["group"][] = ["common", "location", "cell", "gsm", "umts", "lte", "nr", "identifiers", "date"];

type AutocompleteDropdownProps = {
  options: FilterKeyword[];
  listboxId?: string;
  activeKey?: string | null;
  onActiveKeyChange?: (key: string) => void;
  onSelect: (keyword: string) => void;
};

export function AutocompleteDropdown({ options, listboxId, activeKey, onActiveKeyChange, onSelect }: AutocompleteDropdownProps) {
  const { t } = useTranslation("main");
  const generatedListboxId = useId();
  const resolvedListboxId = listboxId ?? generatedListboxId;
  const usesActiveDescendantNavigation = listboxId !== undefined && onActiveKeyChange !== undefined;
  const groups = new Map<FilterKeyword["group"], FilterKeyword[]>();

  for (const option of options) {
    const group = groups.get(option.group) ?? [];
    group.push(option);
    groups.set(option.group, group);
  }

  if (options.length === 0) return null;

  return (
    <div className="custom-scrollbar mt-2 max-h-[min(24rem,calc(100dvh-8rem-var(--floating-nav-map-offset,0rem)-var(--top-viewport-obstruction,0px)))] overflow-y-auto overscroll-contain rounded-xl bg-background/95 shadow-lg ring-1 ring-foreground/10 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-150">
      <div className="p-1.5">
        <div
          id={usesActiveDescendantNavigation ? resolvedListboxId : undefined}
          role={usesActiveDescendantNavigation ? "listbox" : undefined}
          aria-label={usesActiveDescendantNavigation ? t("autocomplete.availableFilters") : undefined}
        >
          {FILTER_GROUP_ORDER.map((groupName) => {
            const groupOptions = groups.get(groupName);
            if (!groupOptions) return null;

            const groupLabelId = `${resolvedListboxId}-group-${groupName}`;
            return (
              <div
                key={groupName}
                role={usesActiveDescendantNavigation ? "group" : undefined}
                aria-labelledby={usesActiveDescendantNavigation ? groupLabelId : undefined}
                className="not-last:border-b not-last:border-border/60 not-last:pb-1.5 not-first:pt-1.5"
              >
                <p id={groupLabelId} className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {t(`autocomplete.groups.${groupName}`)}
                </p>
                <div className="space-y-0.5">
                  {groupOptions.map((option) => {
                    const optionKey = `filter:${option.key}`;
                    const isActive = usesActiveDescendantNavigation && activeKey === optionKey;
                    return (
                      <button
                        key={option.key}
                        id={usesActiveDescendantNavigation ? getSearchOptionId(resolvedListboxId, optionKey) : undefined}
                        type="button"
                        role={usesActiveDescendantNavigation ? "option" : undefined}
                        tabIndex={usesActiveDescendantNavigation ? -1 : undefined}
                        aria-selected={usesActiveDescendantNavigation ? isActive : undefined}
                        onPointerEnter={() => {
                          if (!isActive) onActiveKeyChange?.(optionKey);
                        }}
                        onPointerDown={usesActiveDescendantNavigation ? (event) => event.preventDefault() : undefined}
                        onClick={() => onSelect(option.key)}
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 md:min-h-10",
                          isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/70",
                        )}
                      >
                        <span className="w-44 shrink-0 font-mono text-sm font-semibold text-primary">{option.key}</span>
                        <span className="min-w-0 text-xs leading-4 text-muted-foreground">{t(`autocomplete.filters.${option.descriptionKey}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mx-2.5 mt-1.5 border-t border-dashed border-border/70 pt-2 pb-1 text-[11px] leading-4 text-muted-foreground">
          <span className="font-semibold text-foreground/80">{t("autocomplete.tip")}</span> {t("autocomplete.tipText")} {t("autocomplete.example")}{" "}
          <span className="font-mono text-foreground">band: 800,1800,2100</span>
        </p>
      </div>
    </div>
  );
}

import { ArrowLeftDoubleIcon, FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FILTER_CLEAR_ALL_CLASS, FILTER_COUNT_BADGE_CLASS } from "@/features/shared/filterPanel";
import { cn } from "@/lib/utils";

type ListFilterPanelProps = {
  id: string;
  isShown: boolean;
  activeFilterCount: number;
  hideButtonRef: Ref<HTMLButtonElement>;
  onClearFilters: () => void;
  onHide: (pressedButton: HTMLElement) => void;
  children: ReactNode;
};

const PANEL_CLASS = "flex h-full shrink-0 justify-end overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none";

export function ListFilterPanel({ id, isShown, activeFilterCount, hideButtonRef, onClearFilters, onHide, children }: ListFilterPanelProps) {
  const { t } = useTranslation("common");

  return (
    <aside id={id} aria-label={t("labels.filters")} inert={!isShown} className={cn(PANEL_CLASS, isShown ? "w-72" : "w-0")}>
      <div className="flex h-full w-72 shrink-0 flex-col border-r bg-background [&_button]:cursor-pointer">
        <div className="flex min-h-11.25 shrink-0 items-center gap-2 border-b bg-muted/30 py-2 pr-2 pl-4">
          <HugeiconsIcon icon={FilterIcon} className="size-4 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-medium">{t("labels.filters")}</h2>
          {activeFilterCount > 0 ? (
            <>
              <span className={FILTER_COUNT_BADGE_CLASS} aria-label={t("labels.filtersActive", { count: activeFilterCount })}>
                {activeFilterCount}
              </span>
              <button type="button" onClick={onClearFilters} className={FILTER_CLEAR_ALL_CLASS}>
                {t("actions.clearAll")}
              </button>
            </>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              ref={hideButtonRef}
              render={<Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground" />}
              aria-label={t("actions.hideFilters")}
              aria-expanded={isShown}
              aria-controls={id}
              onClick={(event) => onHide(event.currentTarget)}
            >
              <HugeiconsIcon icon={ArrowLeftDoubleIcon} className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{t("actions.hideFilters")}</TooltipContent>
          </Tooltip>
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3.5 pb-1.5">{children}</div>
      </div>
    </aside>
  );
}

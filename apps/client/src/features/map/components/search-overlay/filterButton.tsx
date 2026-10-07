import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type FilterButtonProps = {
  showFilters: boolean;
  activeFilterCount: number;
  panelId?: string;
  onClick: () => void;
};

export function FilterButton({ showFilters, activeFilterCount, panelId, onClick }: FilterButtonProps) {
  const { t } = useTranslation("common");
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <button
      data-filter-toggle
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
      aria-label={t("labels.filters")}
      aria-expanded={showFilters}
      aria-controls={panelId}
      className={cn(
        "relative flex min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm font-medium transition-all after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] md:min-w-0 md:after:hidden",
        showFilters || hasActiveFilters ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted hover:bg-muted/80 text-foreground",
      )}
    >
      <HugeiconsIcon icon={SlidersHorizontalIcon} className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">{t("labels.filters")}</span>
      {hasActiveFilters ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-xs">{activeFilterCount}</span>
      ) : null}
    </button>
  );
}

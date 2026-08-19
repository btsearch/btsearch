import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils.js";

type FilterButtonProps = {
  showFilters: boolean;
  activeFilterCount: number;
  onClick: () => void;
};

export function FilterButton({ showFilters, activeFilterCount, onClick }: FilterButtonProps) {
  const { t } = useTranslation("common");

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
  }

  return (
    <button
      data-filter-toggle
      onClick={onClick}
      onMouseDown={handleMouseDown}
      type="button"
      aria-label={t("labels.filters")}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all font-medium text-sm shrink-0 whitespace-nowrap",
        showFilters || activeFilterCount > 0 ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted hover:bg-muted/80 text-foreground",
      )}
    >
      <HugeiconsIcon icon={SlidersHorizontalIcon} className="size-4" />
      <span className="hidden sm:inline">{t("labels.filters")}</span>
      {activeFilterCount > 0 && (
        <span
          className={cn(
            "text-xs rounded-full min-w-5 h-5 flex items-center justify-center px-1.5",
            showFilters || activeFilterCount > 0 ? "bg-primary-foreground/20" : "bg-primary text-primary-foreground",
          )}
        >
          {activeFilterCount}
        </span>
      )}
    </button>
  );
}

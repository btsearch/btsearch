import { Cancel01Icon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { StationFilters, StationStatus } from "@/types/station";

type StationStatusPillsProps = {
  statuses: readonly StationStatus[];
  onToggleStatus: (status: StationStatus) => void;
};

type StationStatusFilterProps = {
  filters: StationFilters;
  onToggleStatus: (status: StationStatus) => void;
};

const STATION_STATUS_OPTIONS: { status: StationStatus; icon: IconSvgElement; activeClassName: string }[] = [
  {
    status: "published",
    icon: CheckmarkCircle02Icon,
    activeClassName: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    status: "pending",
    icon: Clock01Icon,
    activeClassName: "border-yellow-600/45 bg-yellow-300/20 text-yellow-800 dark:border-yellow-400/45 dark:bg-yellow-400/15 dark:text-yellow-300",
  },
  {
    status: "inactive",
    icon: Cancel01Icon,
    activeClassName: "border-red-600/40 bg-red-500/10 text-red-700 dark:border-red-400/45 dark:bg-red-400/15 dark:text-red-300",
  },
];

export function StationStatusPills({ statuses, onToggleStatus }: StationStatusPillsProps) {
  const { t } = useTranslation("stations");

  return (
    <div className="flex flex-wrap gap-1.5">
      {STATION_STATUS_OPTIONS.map(({ status, icon, activeClassName }) => {
        const isActive = statuses.includes(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={isActive}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onToggleStatus(status)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? activeClassName : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={icon} className="size-3 shrink-0" />
            <span>{t(`status.${status}`)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StationStatusFilter({ filters, onToggleStatus }: StationStatusFilterProps) {
  const { t } = useTranslation("main");

  if (filters.source !== "internal") return null;

  return (
    <div className="pt-2">
      <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("filters.stationStatus")}</h4>
      <StationStatusPills statuses={filters.status} onToggleStatus={onToggleStatus} />
    </div>
  );
}

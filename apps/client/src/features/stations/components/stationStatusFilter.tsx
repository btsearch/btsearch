import { Cancel01Icon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { ToneFacetPill } from "@/features/shared/filterPanel";
import type { StationStatus } from "@/types/station";

type StationStatusPillsProps = {
  statuses: readonly StationStatus[];
  onToggleStatus: (status: StationStatus) => void;
};

export const STATION_STATUS_TINTS: Record<StationStatus, string> = {
  published: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  pending: "border-yellow-600/45 bg-yellow-300/20 text-yellow-800 dark:border-yellow-400/45 dark:bg-yellow-400/15 dark:text-yellow-300",
  inactive: "border-red-600/40 bg-red-500/10 text-red-700 dark:border-red-400/45 dark:bg-red-400/15 dark:text-red-300",
};

const STATION_STATUS_OPTIONS: { status: StationStatus; icon: IconSvgElement; activeClassName: string }[] = [
  { status: "published", icon: CheckmarkCircle02Icon, activeClassName: STATION_STATUS_TINTS.published },
  { status: "pending", icon: Clock01Icon, activeClassName: STATION_STATUS_TINTS.pending },
  { status: "inactive", icon: Cancel01Icon, activeClassName: STATION_STATUS_TINTS.inactive },
];

export function StationStatusPills({ statuses, onToggleStatus }: StationStatusPillsProps) {
  const { t } = useTranslation("stations");

  return (
    <div className="flex flex-wrap gap-1.5">
      {STATION_STATUS_OPTIONS.map(({ status, icon, activeClassName }) => (
        <ToneFacetPill
          key={status}
          isActive={statuses.includes(status)}
          icon={icon}
          activeClassName={activeClassName}
          onClick={() => onToggleStatus(status)}
        >
          <span>{t(`status.${status}`)}</span>
        </ToneFacetPill>
      ))}
    </div>
  );
}

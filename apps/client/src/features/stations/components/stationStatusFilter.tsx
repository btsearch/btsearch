import { Cancel01Icon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { OFFICIAL_PERMIT_STATUSES, type OfficialPermitStatus } from "@openbts/shared/contract/constants";
import { useTranslation } from "react-i18next";

import { OFFICIAL_STATUS_LOOKS } from "./StationStatusBadge";
import { ToneFacetPill } from "@/features/shared/filterPanel";
import type { StationStatus } from "@/types/station";

type StationStatusPillsProps = {
  statuses: readonly StationStatus[];
  onToggleStatus: (status: StationStatus) => void;
};

type OfficialStatusPillsProps = {
  statuses: readonly OfficialPermitStatus[];
  onToggleStatus: (status: OfficialPermitStatus) => void;
};

export const STATION_STATUS_TINTS: Record<StationStatus, string> = {
  published: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  pending: "border-yellow-600/45 bg-yellow-300/20 text-yellow-800 dark:border-yellow-400/45 dark:bg-yellow-400/15 dark:text-yellow-300",
  inactive: "border-red-600/40 bg-red-500/10 text-red-700 dark:border-red-400/45 dark:bg-red-400/15 dark:text-red-300",
};

const STATION_STATUS_ICONS: Record<StationStatus, IconSvgElement> = {
  published: CheckmarkCircle02Icon,
  pending: Clock01Icon,
  inactive: Cancel01Icon,
};

const STATION_STATUS_OPTIONS: { status: StationStatus; icon: IconSvgElement; activeClassName: string }[] = [
  { status: "published", icon: STATION_STATUS_ICONS.published, activeClassName: STATION_STATUS_TINTS.published },
  { status: "pending", icon: STATION_STATUS_ICONS.pending, activeClassName: STATION_STATUS_TINTS.pending },
  { status: "inactive", icon: STATION_STATUS_ICONS.inactive, activeClassName: STATION_STATUS_TINTS.inactive },
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

export function OfficialStatusPills({ statuses, onToggleStatus }: OfficialStatusPillsProps) {
  const { t } = useTranslation("stations");

  return (
    <div className="flex flex-wrap gap-1.5">
      {OFFICIAL_PERMIT_STATUSES.map((status) => (
        <ToneFacetPill
          key={status}
          isActive={statuses.includes(status)}
          icon={STATION_STATUS_ICONS[OFFICIAL_STATUS_LOOKS[status]]}
          activeClassName={STATION_STATUS_TINTS[OFFICIAL_STATUS_LOOKS[status]]}
          onClick={() => onToggleStatus(status)}
        >
          <span>{t(`officialStatus.${status}`)}</span>
        </ToneFacetPill>
      ))}
    </div>
  );
}

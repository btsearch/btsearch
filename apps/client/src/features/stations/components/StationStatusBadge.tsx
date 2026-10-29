import type { OfficialPermitStatus } from "@openbts/shared/contract";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StationStatus } from "@/types/station";

type StationStatusBadgeProps = {
  status: StationStatus;
  className?: string;
  statusChangedAt?: string;
};

type OfficialStatusBadgeProps = {
  status: OfficialPermitStatus;
  className?: string;
};

type StatusBadgeProps = {
  label: string;
  tooltip: ReactNode;
  className: string;
};

export const STATION_STATUS_TEXT_CLASSES: Record<StationStatus, string> = {
  published: "text-emerald-600 dark:text-emerald-400",
  pending: "text-yellow-800 dark:text-yellow-300",
  inactive: "text-red-700 dark:text-red-300",
};

export const OFFICIAL_STATUS_LOOKS: Record<OfficialPermitStatus, StationStatus> = {
  inService: "published",
  approved: "pending",
};

function StatusBadge({ label, tooltip, className }: StatusBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("inline-flex w-fit text-[11px] font-semibold leading-none cursor-help", className)} />}>
        {label}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function StationStatusBadge({ status, className, statusChangedAt }: StationStatusBadgeProps) {
  const { t, i18n } = useTranslation("stations");
  const showStatusChangedAt = status !== "published" && statusChangedAt !== undefined;

  return (
    <StatusBadge
      label={t(`status.${status}`)}
      className={cn(STATION_STATUS_TEXT_CLASSES[status], className)}
      tooltip={
        <div className="space-y-1">
          <p>{t(`statusTooltip.${status}`)}</p>
          {showStatusChangedAt ? (
            <p className="text-background/85">{t("statusTooltip.changedAt", { date: formatFullDate(statusChangedAt, i18n.language) })}</p>
          ) : null}
        </div>
      }
    />
  );
}

export function OfficialStatusBadge({ status, className }: OfficialStatusBadgeProps) {
  const { t } = useTranslation("stations");

  return (
    <StatusBadge
      label={t(`officialStatus.${status}`)}
      className={cn(STATION_STATUS_TEXT_CLASSES[OFFICIAL_STATUS_LOOKS[status]], className)}
      tooltip={<p>{t(`officialStatusTooltip.${status}`)}</p>}
    />
  );
}

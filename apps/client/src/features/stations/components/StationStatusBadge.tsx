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

export const STATION_STATUS_TEXT_CLASSES: Record<StationStatus, string> = {
  published: "text-emerald-600 dark:text-emerald-400",
  pending: "text-yellow-800 dark:text-yellow-300",
  inactive: "text-red-700 dark:text-red-300",
};

export function StationStatusBadge({ status, className, statusChangedAt }: StationStatusBadgeProps) {
  const { t, i18n } = useTranslation("stations");
  const showStatusChangedAt = status !== "published" && statusChangedAt !== undefined;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn("inline-flex w-fit text-[11px] font-semibold leading-none cursor-help", STATION_STATUS_TEXT_CLASSES[status], className)}
          />
        }
      >
        {t(`status.${status}`)}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-72">
        <div className="space-y-1">
          <p>{t(`statusTooltip.${status}`)}</p>
          {showStatusChangedAt ? (
            <p className="text-background/85">{t("statusTooltip.changedAt", { date: formatFullDate(statusChangedAt, i18n.language) })}</p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import i18n from "@/i18n/config.js";
import { formatFullDate, formatRelativeTime } from "@/lib/format.js";
import { cn } from "@/lib/utils.js";
import type { StationSource } from "@/types/station.js";

import { fetchStats } from "../../statsApi.js";

type StationCounterProps = {
  locationCount: number;
  totalCount: number;
  radioLineCount: number;
  radioLineTotalCount: number;
  isRadioLinesFetching: boolean;
  showStations: boolean;
  zoom?: number;
  source: StationSource;
  onSourceChange: (source: StationSource) => void;
};

export function StationCounter({
  locationCount,
  totalCount,
  radioLineCount,
  radioLineTotalCount,
  isRadioLinesFetching,
  showStations,
  zoom,
  source,
  onSourceChange,
}: StationCounterProps) {
  const { t } = useTranslation("main");
  const { t: tCommon } = useTranslation("common");
  const hasMoreLocations = totalCount > locationCount;
  const hasMoreRadioLines = radioLineTotalCount > radioLineCount;
  const showRadioLines = radioLineCount > 0 || isRadioLinesFetching;

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    staleTime: 1000 * 60 * 60,
  });

  const sourceItems: { label: string; date: string | null | undefined; value: StationSource }[] = [
    { label: t("filters.internalDb"), date: stats?.lastUpdated.stations, value: "internal" },
    { label: t("stationDetails:tabs.permits"), date: stats?.lastUpdated.stations_permits, value: "uke" },
  ];

  return (
    <div className="flex items-stretch shadow-xl rounded-lg overflow-hidden border bg-background/95 backdrop-blur-md">
      {showStations && (
        <Tooltip>
          <TooltipTrigger
            className={cn("px-2 py-1.5 flex items-center gap-2 border-r border-border/50", hasMoreLocations && "cursor-help")}
            disabled={!hasMoreLocations}
          >
            <div className="flex items-baseline gap-1">
              <span className={cn("text-sm font-bold tabular-nums leading-none tracking-tight", hasMoreLocations && "text-amber-500")}>
                {locationCount.toLocaleString(i18n.language)}
              </span>
              <span className="text-[9px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                {t("overlay.locations", { count: locationCount })}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("overlay.moreStations", { total: totalCount, shown: locationCount })}</TooltipContent>
        </Tooltip>
      )}
      {showRadioLines && (
        <Tooltip>
          <TooltipTrigger
            className={cn("px-2 py-1.5 flex items-center gap-2 border-r border-border/50", hasMoreRadioLines && "cursor-help")}
            disabled={!hasMoreRadioLines}
          >
            <div className="flex items-baseline gap-1">
              <span className={cn("text-sm font-bold tabular-nums leading-none tracking-tight", hasMoreRadioLines && "text-amber-500")}>
                {radioLineCount.toLocaleString(i18n.language)}
              </span>
              <span className="text-[9px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                {t("overlay.radiolinesCount", { count: radioLineCount })}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("overlay.moreRadiolines", {
              total: radioLineTotalCount,
              shown: radioLineCount,
            })}
          </TooltipContent>
        </Tooltip>
      )}
      <div
        className={cn(
          "px-2 py-1.5 flex items-center gap-1.5 cursor-pointer transition-colors",
          source === "uke" ? "bg-violet-500/10 hover:bg-violet-500/20" : "bg-emerald-500/10 hover:bg-emerald-500/20",
        )}
        onClick={() => onSourceChange(source === "internal" ? "uke" : "internal")}
      >
        <Tooltip>
          <TooltipTrigger
            className={cn(
              "text-[8px] uppercase font-bold leading-none whitespace-nowrap",
              source === "uke" ? "text-violet-600 dark:text-violet-400" : "text-emerald-700 dark:text-emerald-400",
            )}
          >
            {sourceItems.find((s) => s.value === source)?.label}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {sourceItems.map(({ label, date, value }) => (
              <p key={value} className={cn(source === value && "font-semibold")}>
                {label}: {date ? formatRelativeTime(date, tCommon) : tCommon("status.never")}
                {date && <span className="text-background/60"> · {formatFullDate(date, i18n.language)}</span>}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
        <div className="w-px h-2 bg-border/60" />
        <span
          className={cn(
            "text-[8px] uppercase font-bold leading-none whitespace-nowrap",
            source === "uke" ? "text-violet-600 dark:text-violet-400" : "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {t("overlay.zoom")} {zoom?.toFixed(1) || "-"}
        </span>
      </div>
    </div>
  );
}

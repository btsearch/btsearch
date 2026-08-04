import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.js";
import i18n from "@/i18n/config.js";
import { cn } from "@/lib/utils.js";
import type { StationSource } from "@/types/station.js";

type MobileStatsPanelProps = {
  locationCount: number;
  totalCount: number;
  radioLineCount: number;
  radioLineTotalCount: number;
  isRadioLinesFetching: boolean;
  showStations: boolean;
  searchMode: "bounds" | "search";
  zoom?: number;
  source: StationSource;
  onSourceChange: (source: StationSource) => void;
};

export function MobileStatsPanel({
  locationCount,
  totalCount,
  radioLineCount,
  radioLineTotalCount,
  isRadioLinesFetching,
  showStations,
  searchMode,
  zoom,
  source,
  onSourceChange,
}: MobileStatsPanelProps) {
  const { t } = useTranslation("main");
  const hasMoreLocations = totalCount > locationCount;
  const hasMoreRadioLines = radioLineTotalCount > radioLineCount;
  const showRadioLines = radioLineCount > 0 || isRadioLinesFetching;

  return (
    <div
      className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg overflow-hidden cursor-pointer"
      onClick={() => onSourceChange(source === "internal" ? "uke" : "internal")}
    >
      <Tooltip>
        <TooltipTrigger
          className={cn("px-2 py-1.5 bg-muted/30 flex items-center gap-2", hasMoreLocations && "cursor-help")}
          disabled={!hasMoreLocations}
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              {showStations && (
                <>
                  <span className={cn("text-xs font-bold leading-none", hasMoreLocations && "text-amber-500")}>
                    {locationCount.toLocaleString(i18n.language)}
                  </span>
                  <span className="text-[8px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                    {t("overlay.locations", { count: locationCount })}
                  </span>
                </>
              )}
              {showRadioLines && (
                <>
                  {showStations && <span className="text-[8px] text-muted-foreground leading-none">·</span>}
                  <span className={cn("text-xs font-bold leading-none", hasMoreRadioLines && "text-amber-500")}>
                    {radioLineCount.toLocaleString(i18n.language)}
                  </span>
                  <span className="text-[8px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                    {t("overlay.radiolinesCount", { count: radioLineCount })}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "text-[7px] uppercase font-bold border-b leading-none",
                  source === "uke"
                    ? "text-violet-600 dark:text-violet-400 border-violet-500/30"
                    : "text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
                )}
              >
                {source === "uke" ? "UKE" : "INT"}
              </span>
              <span className="text-[7px] uppercase font-bold text-blue-600 dark:text-blue-400 border-b border-blue-500/20 leading-none">
                Z{zoom?.toFixed(1) || "-"}
              </span>
              {searchMode === "bounds" ? <span className="text-[7px] uppercase font-bold bg-emerald-500 leading-none">SEARCH</span> : null}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          {showStations && <p>{t("overlay.moreStations", { total: totalCount, shown: locationCount })}</p>}
          {hasMoreRadioLines && (
            <p>
              {t("overlay.moreRadiolines", {
                total: radioLineTotalCount,
                shown: radioLineCount,
              })}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

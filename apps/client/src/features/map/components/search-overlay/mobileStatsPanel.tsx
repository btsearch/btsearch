import { useTranslation } from "react-i18next";

import type { MapCountries } from "../../data/mapCountries";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import i18n from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

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
  mapCountries: MapCountries;
  onSourceChange: (source: StationSource) => void;
};

function getPanelCursorClass(isSourceSwitch: boolean, hasMoreLocations: boolean): string | undefined {
  if (isSourceSwitch) return "cursor-pointer";
  return hasMoreLocations ? "cursor-help" : undefined;
}

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
  mapCountries,
  onSourceChange,
}: MobileStatsPanelProps) {
  const { t } = useTranslation("main");
  const hasMoreLocations = totalCount > locationCount;
  const hasMoreRadioLines = radioLineTotalCount > radioLineCount;
  const showRadioLines = radioLineCount > 0 || isRadioLinesFetching;
  const { isRegisterOnScreen } = mapCountries;

  function handleSourceSwitch() {
    onSourceChange(source === "internal" ? "uke" : "internal");
  }

  return (
    <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg overflow-hidden">
      <Tooltip>
        <TooltipTrigger
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={isRegisterOnScreen ? handleSourceSwitch : undefined}
          className={cn("px-2 py-1.5 bg-muted/30 flex items-center gap-2", getPanelCursorClass(isRegisterOnScreen, hasMoreLocations))}
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
              {showStations ? (
                <>
                  <span className={cn("text-xs font-bold leading-none", hasMoreLocations && "text-amber-500")}>
                    {locationCount.toLocaleString(i18n.language)}
                  </span>
                  <span className="text-[8px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                    {t("overlay.locations", { count: locationCount })}
                  </span>
                </>
              ) : null}
              {showRadioLines ? (
                <>
                  {showStations ? (
                    <span aria-hidden="true" className="text-[8px] text-muted-foreground leading-none">
                      ·
                    </span>
                  ) : null}
                  <span className={cn("text-xs font-bold leading-none", hasMoreRadioLines && "text-amber-500")}>
                    {radioLineCount.toLocaleString(i18n.language)}
                  </span>
                  <span className="text-[8px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                    {t("overlay.radiolinesCount", { count: radioLineCount })}
                  </span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {isRegisterOnScreen ? (
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
              ) : null}
              <span className="text-[7px] uppercase font-bold text-blue-600 dark:text-blue-400 leading-none">Z{zoom?.toFixed(1) || "-"}</span>
              {searchMode === "search" ? <span className="text-[7px] uppercase font-bold text-emerald-500 leading-none">SEARCH</span> : null}
            </div>
          </div>
        </TooltipTrigger>
        {hasMoreLocations ? (
          <TooltipContent side="top">
            {showStations ? <p>{t("overlay.moreStations", { total: totalCount, shown: locationCount })}</p> : null}
            {hasMoreRadioLines ? (
              <p>
                {t("overlay.moreRadiolines", {
                  total: radioLineTotalCount,
                  shown: radioLineCount,
                })}
              </p>
            ) : null}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </div>
  );
}

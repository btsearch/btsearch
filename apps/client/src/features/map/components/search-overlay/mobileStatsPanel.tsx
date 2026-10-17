import { useTranslation } from "react-i18next";

import type { MapCountries } from "../../data/mapCountries";
import { useOfficialLabel } from "../../hooks/useOfficialLabel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import i18n from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

type MobileStatsPanelProps = {
  locationCount: number;
  totalCount: number;
  microwaveLinkCount: number;
  microwaveLinkTotalCount: number;
  isMicrowaveLinksFetching: boolean;
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
  microwaveLinkCount,
  microwaveLinkTotalCount,
  isMicrowaveLinksFetching,
  showStations,
  searchMode,
  zoom,
  source,
  mapCountries,
  onSourceChange,
}: MobileStatsPanelProps) {
  const { t } = useTranslation("main");
  const officialLabel = useOfficialLabel(mapCountries.onScreen);
  const hasMoreLocations = totalCount > locationCount;
  const hasMoreMicrowaveLinks = microwaveLinkTotalCount > microwaveLinkCount;
  const showMicrowaveLinks = microwaveLinkCount > 0 || isMicrowaveLinksFetching;
  const hasSourceSwitch = mapCountries.capabilities.official;

  function handleSourceSwitch() {
    onSourceChange(source === "internal" ? "official" : "internal");
  }

  return (
    <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg overflow-hidden">
      <Tooltip>
        <TooltipTrigger
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={hasSourceSwitch ? handleSourceSwitch : undefined}
          className={cn("px-2 py-1.5 bg-muted/30 flex items-center gap-2", getPanelCursorClass(hasSourceSwitch, hasMoreLocations))}
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
              {showMicrowaveLinks ? (
                <>
                  {showStations ? (
                    <span aria-hidden="true" className="text-[8px] text-muted-foreground leading-none">
                      ·
                    </span>
                  ) : null}
                  <span className={cn("text-xs font-bold leading-none", hasMoreMicrowaveLinks && "text-amber-500")}>
                    {microwaveLinkCount.toLocaleString(i18n.language)}
                  </span>
                  <span className="text-[8px] font-bold text-muted-foreground leading-none uppercase tracking-wider">
                    {t("overlay.radiolinesCount", { count: microwaveLinkCount })}
                  </span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              {hasSourceSwitch ? (
                <span
                  className={cn(
                    "text-[7px] uppercase font-bold border-b leading-none",
                    source === "official"
                      ? "text-violet-600 dark:text-violet-400 border-violet-500/30"
                      : "text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
                  )}
                >
                  {source === "official" ? officialLabel : "INT"}
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
            {hasMoreMicrowaveLinks ? (
              <p>
                {t("overlay.moreRadiolines", {
                  total: microwaveLinkTotalCount,
                  shown: microwaveLinkCount,
                })}
              </p>
            ) : null}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </div>
  );
}

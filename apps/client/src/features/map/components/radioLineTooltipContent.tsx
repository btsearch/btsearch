import { ArrowDown02Icon, ArrowRight02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";

import { cn } from "@/lib/utils";

import { type RadioLinkType, getLinkTypeStyle } from "../utils";

export type RadioLineTooltipContentProps = {
  color: string;
  operatorName: string;
  distanceFormatted: string;
  directions: { freq: string; bandwidth: string | null; polarization: string | null; forward: boolean }[];
  directionCount: number;
  linkType?: RadioLinkType;
  dlSpeed?: string | null;
  ulSpeed?: string | null;
};

export const RadioLineTooltipContent = memo(function RadioLineTooltipContent({
  color,
  operatorName,
  distanceFormatted,
  directions,
  directionCount,
  linkType,
  dlSpeed,
  ulSpeed,
}: RadioLineTooltipContentProps) {
  const linkTypeStyle = linkType ? getLinkTypeStyle(linkType) : null;

  return (
    <div className="min-w-40">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-xs font-medium truncate">{operatorName}</span>
        <div className="ml-auto flex items-center text-[11px] font-mono whitespace-nowrap">
          <span className="text-muted-foreground">{distanceFormatted}</span>
          {linkTypeStyle && linkType && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className={cn("font-bold uppercase", linkTypeStyle.text)}>{linkType}</span>
            </>
          )}
          {((dlSpeed !== null && dlSpeed !== undefined) || (ulSpeed !== null && ulSpeed !== undefined)) && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <span className="inline-flex items-center gap-0.5 font-semibold">
                {dlSpeed !== null && dlSpeed !== undefined && (
                  <span className="inline-flex items-center gap-0.5">
                    <HugeiconsIcon icon={ArrowDown02Icon} className="size-2.5 text-foreground" />
                    <span className="text-emerald-600">{dlSpeed}</span>
                  </span>
                )}
                {dlSpeed !== null && dlSpeed !== undefined && ulSpeed !== null && ulSpeed !== undefined && (
                  <span className="text-muted-foreground/40 mx-0.5">/</span>
                )}
                {ulSpeed !== null && ulSpeed !== undefined && (
                  <span className="inline-flex items-center gap-0.5">
                    <HugeiconsIcon icon={ArrowUp02Icon} className="size-2.5 text-foreground" />
                    <span className="text-emerald-600">{ulSpeed}</span>
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {directions.length > 0 && (
        <div className="border-t border-border/40 px-2.5 py-1.5 space-y-1">
          {directions.map((dir, index) => {
            const isLastInPair = linkType !== "XPIC" && directionCount > 1 && index % 2 === 1;
            const isLastDirection = index === directions.length - 1;

            return (
              <div key={`${dir.freq}-${dir.polarization}-${dir.forward}`}>
                <div className="flex items-center gap-2">
                  {directionCount > 1 && (
                    <span className="flex items-center gap-px text-[9px] font-bold text-muted-foreground shrink-0">
                      {dir.forward ? "A" : "B"}
                      <HugeiconsIcon icon={ArrowRight02Icon} className="size-2.5" />
                      {dir.forward ? "B" : "A"}
                    </span>
                  )}
                  <span className="text-[11px] font-mono font-medium whitespace-nowrap">{dir.freq}</span>
                  {dir.polarization && <span className="text-[9px] font-bold text-muted-foreground">{dir.polarization}</span>}
                  {dir.bandwidth && (
                    <>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">{dir.bandwidth}</span>
                    </>
                  )}
                </div>
                {isLastInPair && !isLastDirection && <div className="border-b border-border/30 my-1" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

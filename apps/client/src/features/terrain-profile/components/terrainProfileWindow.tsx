import { ArrowDown01Icon, MountainIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { PROFILE_PART_PROPS } from "../focus";
import { useTerrainFormat } from "../format";
import type { TerrainPanelStore } from "../panelStore";
import type { ReadyTerrainProfile } from "../types";
import { getTerrainPathVerdict } from "../verdict";
import { TerrainProfileAntennaSection } from "./terrainProfileAntennaSection";
import { TerrainProfileEvidence } from "./terrainProfileEvidence";
import { TerrainProfileFigure } from "./terrainProfileFigure";
import { TerrainProfileReceiverSection } from "./terrainProfileReceiverSection";
import { TerrainProfileStationButton } from "./terrainProfileStationButton";
import { TerrainProfileStatus } from "./terrainProfileStatus";
import { getStaleTextClassName } from "./terrainProfileStyles";
import { TerrainVerdictIcon, getPathSummary, getShortVerdict } from "./terrainProfileVerdict";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FLOATING_DIALOG_FADE_MOTION } from "@/features/floating-dialogs/animation";
import type { FloatingDialogPanelFrameProps } from "@/features/floating-dialogs/types";
import { getLocationLabel } from "@/features/station-details/station/utils/stations";
import { getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

type TerrainProfileWindowProps = {
  store: TerrainPanelStore;
  frame: FloatingDialogPanelFrameProps;
};

type CollapsedVerdictProps = {
  profile: ReadyTerrainProfile;
  isStale: boolean;
};

const WINDOW_CONTENT_CLASS = "relative flex w-full flex-col overflow-hidden rounded-2xl bg-background text-foreground shadow-2xl";
const WINDOW_BODY_CLASS = "@container custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto";
const WINDOW_COLUMNS_CLASS = "grid shrink-0 @2xl:grid-cols-[307px_minmax(0,1fr)] @2xl:in-data-[height-mode=manual]:grow";

function CollapsedVerdict({ profile, isStale }: CollapsedVerdictProps) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();
  const verdict = getTerrainPathVerdict(profile.result);

  return (
    <motion.span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold" {...FLOATING_DIALOG_FADE_MOTION}>
      <TerrainVerdictIcon verdict={verdict} isStale={isStale} className="size-4" />
      <span className={getStaleTextClassName(isStale)}>{getShortVerdict(verdict, t)}</span>
      <span className="font-mono text-xs font-medium tabular-nums text-muted-foreground">{getPathSummary(profile.result, format, t)}</span>
    </motion.span>
  );
}

export function TerrainProfileWindow({ store, frame }: TerrainProfileWindowProps) {
  const { t } = useTranslation("terrainProfile");
  const panel = useSyncExternalStore(store.subscribe, store.get);
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    windowRef.current?.focus({ preventScroll: true });
  }, []);

  const { className, contentClassName, contentRef, bodyRef, bodyContentRef, headerDragProps } = frame;
  const { isCollapsed, mode, profile, station } = panel;
  const isStale = mode === "calculating";
  const isWorking = mode === "firstRun" || isStale;
  const collapseLabel = isCollapsed ? t("header.expand") : t("header.collapse");
  const address = getLocationLabel(station);

  return (
    <div ref={windowRef} role="region" aria-label={t("title")} tabIndex={-1} className={cn("outline-none", className)} {...PROFILE_PART_PROPS}>
      <div ref={contentRef} className={cn(WINDOW_CONTENT_CLASS, contentClassName, "border-0")}>
        <div {...headerDragProps} className={cn("shrink-0 border-b", headerDragProps?.className)}>
          <div
            className="flex min-h-12 items-center gap-2.5 py-2 pr-2.5 pl-4"
            style={{ backgroundImage: getOperatorHeaderTintGradient(panel.brandColor) }}
          >
            <HugeiconsIcon icon={MountainIcon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="shrink-0 text-sm font-semibold">{t("title")}</h2>
            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
            <TerrainProfileStationButton panel={panel} />
            {address === null ? null : <span className="min-w-0 truncate text-xs text-muted-foreground">{address}</span>}
            <AnimatePresence initial={false}>
              {isCollapsed && profile !== null ? <CollapsedVerdict key="verdict" profile={profile} isStale={isStale} /> : null}
            </AnimatePresence>
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger
                  aria-label={collapseLabel}
                  onClick={() => panel.setCollapsed(!isCollapsed)}
                  render={<Button type="button" variant="ghost" size="icon-sm" className="cursor-pointer text-muted-foreground" />}
                >
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className={cn("transition-transform duration-150 motion-reduce:transition-none", isCollapsed ? "rotate-180" : null)}
                  />
                </TooltipTrigger>
                <TooltipContent>{collapseLabel}</TooltipContent>
              </Tooltip>
              <CloseButton onClick={panel.close} onPointerDown={(event) => event.stopPropagation()} />
            </div>
          </div>
          <div
            role="progressbar"
            aria-label={t("states.calculating")}
            aria-hidden={!isWorking}
            className={cn(
              "h-0.5 overflow-hidden bg-muted transition-opacity duration-150 motion-reduce:transition-none",
              isWorking ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="h-full w-2/5 rounded-full bg-primary motion-safe:animate-pulse" />
          </div>
        </div>
        <div ref={bodyRef} inert={isCollapsed} className={WINDOW_BODY_CLASS}>
          <div ref={bodyContentRef} className={WINDOW_COLUMNS_CLASS}>
            <div className="flex flex-col gap-3.5 border-b px-4 py-3.5 @2xl:border-r @2xl:border-b-0">
              <TerrainProfileStatus panel={panel} />
              <TerrainProfileAntennaSection panel={panel} />
              <TerrainProfileReceiverSection panel={panel} onChangePoint={panel.togglePointPick} />
            </div>
            <div className="flex min-w-0 flex-col gap-2 px-4 py-3 @2xl:pl-[15px]">
              <TerrainProfileFigure panel={panel} />
              <TerrainProfileEvidence panel={panel} />
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl border border-border/70" />
      </div>
    </div>
  );
}

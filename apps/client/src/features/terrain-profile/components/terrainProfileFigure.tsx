import { MountainIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";

import type { TerrainProfileMode, TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import { PATH_DISTANCE_TEXT_VALUES } from "../receiverRange";
import { FIGURE_SIZE_CLASS, getStaleFigureClassName } from "./terrainProfileStyles";
import { LoadingIcon } from "@/components/ui/loading-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function loadTerrainProfileChart() {
  return import("./terrainProfileChart");
}

const TerrainProfileChart = lazy(loadTerrainProfileChart);

export function preloadTerrainProfileChart(): void {
  void loadTerrainProfileChart();
}

type TerrainProfileFigureProps = {
  panel: TerrainProfilePanelModel;
  isCompact?: boolean;
};

type FigurePlaceholderProps = {
  mode: TerrainProfileMode;
  className: string;
};

function FigurePlaceholder({ mode, className }: FigurePlaceholderProps) {
  const { t } = useTranslation("terrainProfile");
  let message = t("placeholder.failed");
  if (mode === "placing") message = t("placeholder.placing");
  if (mode === "firstRun") message = t("placeholder.calculating");

  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 text-center", className)}>
      <HugeiconsIcon icon={MountainIcon} className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-[13px] leading-[1.125rem] font-medium">{message}</p>
      <p className="text-xs leading-4 text-muted-foreground">{t("placeholder.range", PATH_DISTANCE_TEXT_VALUES)}</p>
    </div>
  );
}

function RecalculatingNotice({ isShown }: { isShown: boolean }) {
  const { t } = useTranslation("terrainProfile");

  return (
    <>
      <span role="status" className="sr-only">
        {isShown ? t("states.recalculating") : null}
      </span>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2",
          "rounded-full border bg-background px-3 py-1.5 text-xs leading-4 whitespace-nowrap shadow-sm",
          "transition-opacity duration-150 motion-reduce:transition-none",
          isShown ? "opacity-100" : "opacity-0",
        )}
      >
        <LoadingIcon className="size-3 text-primary" />
        {t("states.recalculating")}
      </div>
    </>
  );
}

export function TerrainProfileFigure({ panel, isCompact = false }: TerrainProfileFigureProps) {
  const { profile, summary, mode } = panel;
  const sizeClass = isCompact ? FIGURE_SIZE_CLASS.compact : FIGURE_SIZE_CLASS.regular;
  if (profile === null || summary === null) return <FigurePlaceholder mode={mode} className={sizeClass} />;

  const isStale = mode === "calculating";
  const stretchClass = isCompact ? null : "flex-1";

  return (
    <div className={cn("relative flex flex-col", stretchClass)}>
      <div className={cn("flex flex-col", stretchClass, getStaleFigureClassName(isStale))}>
        <Suspense fallback={<Skeleton className={cn("w-full", sizeClass)} />}>
          <TerrainProfileChart profile={profile} summary={summary} siteId={panel.station.siteId} hover={panel.hover} isCompact={isCompact} />
        </Suspense>
      </div>
      <RecalculatingNotice isShown={isStale} />
    </div>
  );
}

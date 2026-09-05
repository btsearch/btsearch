import { Alert02Icon, Cancel01Icon, Clock01Icon, Note01Icon, PencilEdit02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { TerrainProfileAnalyzeButton } from "@/features/terrain-profile/components/terrainProfileAnalyzeButton";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import { getOperatorColor } from "@/lib/cellular/operators";
import { getHardwareLeaseOperator } from "@/lib/cellular/stations";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { stationQueryOptions } from "../queries";
import type { TabId } from "../tabs";
import { StationDetailsBody } from "./dialogBody";
import { DialogOperatorName } from "./dialogOperatorName";
import { useFloatingDialogStack } from "./floatingDialogStackProvider";
import { getStationHistoryTriggerId } from "./floatingDialogStackTypes";
import type { FloatingDialogPanelFrameProps } from "./floatingDialogStackTypes";
import { MainPhotoPanel } from "./mainPhotoPanel";
import { ShareButton } from "./shareButton";
import { StationDialogActionBar, stationDialogInlineActionClassName, stationDialogInlineActionLabelClassName } from "./stationDialogActionBar";
import { stationDialogHeaderIconActionClassName } from "./stationDialogHeaderStyles";
import { WatchButton } from "./watchButton";

type StationDetailsDialogPanelProps = FloatingDialogPanelFrameProps & {
  stationId: number;
  source: "internal" | "uke";
  onContentLayoutChange?: () => void;
  showPhotoPanel?: boolean;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

export function StationDetailsDialogPanel({
  stationId,
  source,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  onContentLayoutChange,
  style,
  headerDragProps,
  showPhotoPanel = true,
  onStartTerrainProfile,
}: StationDetailsDialogPanelProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { t: tCommon } = useTranslation("common");
  const [activeTab, setActiveTab] = useState<TabId>(source === "uke" ? "permits" : "specs");
  const { openStationHistoryDialog } = useFloatingDialogStack();
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const userRole = session?.user?.role as string | undefined;
  const isAdmin = userRole === "admin" || userRole === "editor";
  const { preferences } = usePreferences();

  const { data: station, isLoading, error } = useQuery(stationQueryOptions(stationId, source));

  const operatorColor = station ? getOperatorColor(station.operator.mnc) : "#3b82f6";
  const leaseOperator = station ? getHardwareLeaseOperator(station.station_id, station.operator.mnc) : null;
  const stationNotes = station?.notes?.trim();
  const headerDragClassName = headerDragProps?.className;
  const hasStationActions = !!session?.user || !!onStartTerrainProfile;
  const stationCity = station?.location.city || t("page.unknownLocation");
  const stationAddress = station?.extra_address || station?.location.address;

  return (
    <div className={cn("relative", className)} style={style}>
      <div
        ref={contentRef}
        className={cn(
          "relative bg-background rounded-2xl shadow-2xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden",
          contentClassName,
        )}
      >
        <div {...headerDragProps} className={cn("shrink-0 bg-background/95 backdrop-blur-sm border-b", headerDragClassName)}>
          <div
            className="relative flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5"
            style={{ backgroundImage: `linear-gradient(115deg, ${operatorColor}24 0%, ${operatorColor}0f 34%, transparent 70%)` }}
          >
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-5 w-48 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                </div>
              ) : station ? (
                <div className="min-w-0 space-y-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pr-28 sm:pr-0">
                    <DialogOperatorName name={station.operator.name} mnc={station.operator.mnc} />
                    {leaseOperator ? (
                      <Tooltip>
                        <TooltipTrigger className="shrink-0 cursor-help font-mono text-xs font-medium text-muted-foreground underline decoration-amber-500/50 decoration-dashed underline-offset-2">
                          {station.station_id}
                        </TooltipTrigger>
                        <TooltipContent>{t("dialog.hardwareLease", { operator: leaseOperator })}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{station.station_id}</span>
                    )}
                    {station.is_confirmed ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                        <span className="hidden sm:inline">{t("common:labels.confirmed")}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">{station.location.city}</p>
                    {station.status ? <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} /> : null}
                  </div>
                  <p className="text-xs leading-4 text-muted-foreground">
                    {station.extra_address || station.location.address || t("dialog.btsStation")}
                  </p>
                  <div className="flex flex-col items-start pt-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    <Tooltip>
                      <TooltipTrigger className="cursor-default whitespace-nowrap text-[11px] text-muted-foreground/80">
                        {tCommon("labels.created")}: {formatRelativeTime(station.createdAt, tCommon)}
                      </TooltipTrigger>
                      <TooltipContent>{formatFullDate(station.createdAt, i18n.language)}</TooltipContent>
                    </Tooltip>
                    <span className="hidden text-[11px] text-muted-foreground/40 sm:inline">·</span>
                    <time
                      dateTime={station.updatedAt}
                      title={formatFullDate(station.updatedAt, i18n.language)}
                      className="whitespace-nowrap text-[11px] text-muted-foreground/80"
                    >
                      {tCommon("labels.updated")}: {formatRelativeTime(station.updatedAt, tCommon)}
                    </time>
                  </div>
                  {source === "internal" || hasStationActions ? (
                    <StationDialogActionBar>
                      {source === "internal" ? (
                        <button
                          id={getStationHistoryTriggerId(station.id)}
                          type="button"
                          aria-haspopup="dialog"
                          onClick={() =>
                            openStationHistoryDialog({
                              stationId: station.id,
                              stationCode: station.station_id,
                              operatorName: station.operator.name,
                              operatorMnc: station.operator.mnc,
                            })
                          }
                          className={cn(stationDialogInlineActionClassName, "w-auto px-1.5")}
                        >
                          <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
                          <span className="whitespace-nowrap text-xs font-medium leading-none">{t("history.action")}</span>
                        </button>
                      ) : null}
                      {hasStationActions ? (
                        <>
                          <AddToListPopover
                            stationId={station.id}
                            size="md"
                            className={stationDialogInlineActionClassName}
                            showLabel
                            labelClassName={stationDialogInlineActionLabelClassName}
                            showTooltip={false}
                          />
                          <WatchButton
                            stationId={station.id}
                            size="md"
                            className={stationDialogInlineActionClassName}
                            showLabel
                            labelClassName={stationDialogInlineActionLabelClassName}
                            showTooltip={false}
                          />
                          {onStartTerrainProfile ? (
                            <TerrainProfileAnalyzeButton
                              target={{
                                source: "internal",
                                id: station.id,
                                stationId: station.station_id,
                                operatorName: station.operator.name,
                                latitude: station.location.latitude,
                                longitude: station.location.longitude,
                              }}
                              onStart={(target) => {
                                onStartTerrainProfile(target);
                                onClose();
                              }}
                              size="md"
                              className={stationDialogInlineActionClassName}
                              showLabel
                              labelClassName={stationDialogInlineActionLabelClassName}
                              showTooltip={false}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </StationDialogActionBar>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="absolute top-2 right-2 flex shrink-0 items-center gap-0.5 sm:static sm:-mt-1 sm:-mr-2">
              {station && (
                <>
                  <ShareButton
                    title={`${station.station_id} (${station.operator.name})`}
                    text={`${station.station_id} (${station.operator.name}) - ${stationCity}${stationAddress ? ` ${stationAddress}` : ""}`}
                    url={`${window.location.origin}/stations/${station.id}`}
                    size="md"
                    className={stationDialogHeaderIconActionClassName}
                  />
                  {isAdmin ? (
                    <Link
                      to="/admin/stations/$id"
                      params={{ id: String(station.id) }}
                      search={{ uke: undefined }}
                      className="ml-1 mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                      onClick={onClose}
                    >
                      <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                      <span className="hidden sm:inline">{t("common:actions.edit")}</span>
                    </Link>
                  ) : (
                    settings?.submissionsEnabled && (
                      <Link
                        to="/submission"
                        search={{ station: String(station.id) }}
                        className="ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                        onClick={onClose}
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                        <span className="hidden sm:inline">{t("common:actions.edit")}</span>
                      </Link>
                    )
                  )}
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted [&_svg]:pointer-events-none"
                aria-label={t("common:actions.close")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-5 shrink-0" />
              </button>
            </div>
          </div>
          {stationNotes ? (
            <div className="border-t border-primary/20 bg-primary/8 px-6 py-3 text-primary">
              <div className="flex items-start gap-2.5">
                <HugeiconsIcon icon={Note01Icon} className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold">{t("specs.internalNotes")}</p>
                  <p className="max-h-20 overflow-y-auto whitespace-pre-wrap wrap-break-word pr-1 text-xs leading-relaxed text-foreground custom-scrollbar">
                    {stationNotes}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {station?.status === "inactive" ? (
            <div className="border-t border-red-600/30 bg-red-500/10 px-6 py-3 text-red-700 dark:border-red-400/35 dark:bg-red-400/12 dark:text-red-300">
              <div className="flex items-start gap-2.5">
                <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">{t("dialog.inactiveStationTitle")}</p>
                  <p className="text-xs text-red-700/85 dark:text-red-300/80">{t("dialog.inactiveStationDescription")}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <StationDetailsBody
          stationId={stationId}
          source={source}
          isLoading={isLoading}
          error={error}
          station={station}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={onClose}
          isAdmin={isAdmin}
          bodyRef={bodyRef}
          bodyContentRef={bodyContentRef}
          onContentLayoutChange={onContentLayoutChange}
        />
      </div>

      {source === "internal" && showPhotoPanel && preferences.showStationPhotoPanel && (
        <div className="absolute top-0 left-full pl-3 hidden xl:flex h-full max-h-[calc(100dvh-2rem)]">
          <MainPhotoPanel stationId={stationId} onOpenPhotoTab={() => setActiveTab("photos")} />
        </div>
      )}
    </div>
  );
}

import {
  Add01Icon,
  Cancel01Icon,
  Globe02Icon,
  Location01Icon,
  MapsLocation01Icon,
  MountainIcon,
  Radar01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/authClient";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { formatCoordinates } from "@/lib/gpsUtils";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { UkeStation } from "@/types/station";

import { fetchElevation, fetchPemReports, fetchUkeStation } from "../api";
import { CopyButton } from "./copyButton";
import { DialogOperatorName } from "./dialogOperatorName";
import type { FloatingDialogPanelFrameProps } from "./floatingDialogStackTypes";
import { NavigationLinks } from "./navLinks";
import { PermitsList } from "./permitsList";
import { ShareButton } from "./shareButton";
import { SI2PEMReportsMenu } from "./si2pemReportsMenu";
import { StationDialogActionBar, stationDialogInlineActionClassName, stationDialogInlineActionLabelClassName } from "./stationDialogActionBar";
import { stationDialogHeaderIconActionClassName } from "./stationDialogHeaderStyles";
import { StationInfoItem } from "./stationInfoItem";
import { UKELogo } from "./ukeLogo";
import { WatchButton } from "./watchButton";

type UkePermitDetailsDialogPanelProps = FloatingDialogPanelFrameProps & {
  station: UkeStation;
};

export function UkePermitDetailsDialogPanel({
  station,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: UkePermitDetailsDialogPanelProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { t: tCommon } = useTranslation("common");
  const { preferences } = usePreferences();
  const location = useLocation();
  const isOnMap = location.pathname === "/" || location.pathname.startsWith("/lists/");
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const userRole = session?.user?.role as string | undefined;
  const isAdmin = userRole === "admin" || userRole === "editor";
  const isLoggedIn = !!session?.user;

  const { data: ukeStation = station, isLoading: stationLoading } = useQuery({
    queryKey: ["uke-station", station.id],
    queryFn: () => fetchUkeStation(station.id),
    placeholderData: station,
    staleTime: 1000 * 60 * 5,
  });

  const { location: stationLocation, operator, permits, station_id } = ukeStation;

  const { data: pemReports } = useQuery({
    queryKey: ["station-pem", station_id, stationLocation?.latitude, stationLocation?.longitude, operator?.mnc],
    queryFn: () => fetchPemReports(station_id, stationLocation!.latitude, stationLocation!.longitude, operator!.mnc!),
    staleTime: 1000 * 60 * 60,
    enabled: !!station_id && !!stationLocation && !!operator?.mnc,
    retry: false,
  });

  const { data: elevation } = useQuery({
    queryKey: ["elevation", stationLocation?.latitude, stationLocation?.longitude],
    queryFn: () => fetchElevation(stationLocation!.latitude, stationLocation!.longitude),
    staleTime: 1000 * 60 * 60 * 24,
    enabled: !!stationLocation && preferences.showElevation,
    retry: false,
  });

  const operatorColor = operator?.mnc ? getOperatorColor(operator.mnc) : "#3b82f6";
  const headerDragClassName = headerDragProps?.className;
  const createdAt = ukeStation.createdAt;
  const updatedAt = ukeStation.updatedAt;

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
              <div className="min-w-0 space-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pr-28 sm:pr-0">
                  <DialogOperatorName name={operator?.name ?? t("main:unknownOperator")} mnc={operator?.mnc} />
                  <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{station_id}</span>
                </div>
                {stationLocation && (
                  <div className="space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">{stationLocation.city}</p>
                    <p className="text-xs leading-4 text-muted-foreground">{stationLocation.address || t("dialog.btsStation")}</p>
                    {createdAt && updatedAt && (
                      <div className="flex flex-col items-start pt-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                        <Tooltip>
                          <TooltipTrigger className="cursor-default whitespace-nowrap text-[11px] text-muted-foreground/80">
                            {tCommon("labels.created")}: {formatRelativeTime(createdAt, tCommon)}
                          </TooltipTrigger>
                          <TooltipContent>{formatFullDate(createdAt, i18n.language)}</TooltipContent>
                        </Tooltip>
                        <span className="hidden text-[11px] text-muted-foreground/40 sm:inline">·</span>
                        <Tooltip>
                          <TooltipTrigger className="cursor-default whitespace-nowrap text-[11px] text-muted-foreground/80">
                            {tCommon("labels.updated")}: {formatRelativeTime(updatedAt, tCommon)}
                          </TooltipTrigger>
                          <TooltipContent>{formatFullDate(updatedAt, i18n.language)}</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                )}
                {stationLocation && isLoggedIn ? (
                  <StationDialogActionBar>
                    <AddToListPopover
                      ukeStationId={ukeStation.id}
                      size="md"
                      className={stationDialogInlineActionClassName}
                      showLabel
                      labelClassName={stationDialogInlineActionLabelClassName}
                      showTooltip={false}
                    />
                    <WatchButton
                      stationId={ukeStation.id}
                      source="uke"
                      size="md"
                      className={stationDialogInlineActionClassName}
                      showLabel
                      labelClassName={stationDialogInlineActionLabelClassName}
                      showTooltip={false}
                    />
                  </StationDialogActionBar>
                ) : null}
              </div>
            </div>
            <div className="absolute top-2 right-2 flex shrink-0 items-center gap-0.5 sm:static sm:-mt-1 sm:-mr-2">
              {stationLocation && (
                <>
                  <ShareButton
                    title={`${station_id} (${operator?.name ?? "UKE"})`}
                    text={`UKE: ${station_id} (${operator?.name ?? "UKE"}) - ${stationLocation.city} ${stationLocation.address}`}
                    url={`${window.location.origin}/#map=16/${stationLocation.latitude}/${stationLocation.longitude}~fu~S${station_id}`}
                    size="md"
                    className={stationDialogHeaderIconActionClassName}
                  />
                </>
              )}
              {isAdmin ? (
                <Link
                  to="/admin/stations/$id"
                  params={{ id: "new" }}
                  search={{ uke: station_id }}
                  className="ml-1 mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                  onClick={onClose}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                  <span className="hidden sm:inline">{t("dialog.createStation")}</span>
                </Link>
              ) : isLoggedIn && settings?.submissionsEnabled ? (
                <Link
                  to="/submission"
                  search={{ uke: station_id }}
                  className="ml-1 mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                  onClick={onClose}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                  <span className="hidden sm:inline">{t("dialog.createStation")}</span>
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(event) => event.stopPropagation()}
                className="inline-flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted [&_svg]:pointer-events-none"
                aria-label={t("common:actions.close")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto custom-scrollbar">
          <div ref={bodyContentRef}>
            <div className="px-6 py-5">
              <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
                {stationLocation && (
                  <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
                    <span className="font-mono break-all">
                      {formatCoordinates(stationLocation.latitude, stationLocation.longitude, preferences.gpsFormat)}
                    </span>
                    <CopyButton text={`${stationLocation.latitude}, ${stationLocation.longitude}`} />
                    {preferences.navLinksDisplay === "inline" && (
                      <NavigationLinks latitude={stationLocation.latitude} longitude={stationLocation.longitude} displayMode="inline" />
                    )}
                  </StationInfoItem>
                )}

                {stationLocation?.region && (
                  <StationInfoItem icon={<HugeiconsIcon icon={Globe02Icon} className="size-4" />} label={t("common:labels.region")}>
                    <span>{stationLocation.region.name}</span>
                  </StationInfoItem>
                )}

                <StationInfoItem icon={<HugeiconsIcon icon={Tag01Icon} className="size-4" />} label={t("common:labels.stationId")}>
                  <span className="font-mono">{station_id}</span>
                  <CopyButton text={station_id} />
                </StationInfoItem>

                {station_id && stationLocation && pemReports && pemReports.length > 0 ? (
                  <StationInfoItem icon={<HugeiconsIcon icon={Radar01Icon} className="size-4" />} label={t("specs.pemReports")}>
                    <SI2PEMReportsMenu
                      reports={pemReports}
                      latitude={stationLocation.latitude}
                      longitude={stationLocation.longitude}
                      operatorName={operator?.name ?? t("main:unknownOperator")}
                      operatorMnc={operator?.mnc}
                    />
                  </StationInfoItem>
                ) : null}

                {elevation !== undefined && (
                  <StationInfoItem icon={<HugeiconsIcon icon={MountainIcon} className="size-4" />} label={t("common:labels.elevation")}>
                    <span>{elevation} m</span>
                  </StationInfoItem>
                )}

                {stationLocation && (!isOnMap || (preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3 sm:col-span-2">
                    {!isOnMap && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Link
                              to="/"
                              hash={`map=16/${stationLocation.latitude}/${stationLocation.longitude}~fu~L${stationLocation.id}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              onClick={onClose}
                            />
                          }
                        >
                          <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
                          {t("dialog.showOnMap")}
                        </TooltipTrigger>
                        <TooltipContent>{t("dialog.showOnMap")}</TooltipContent>
                      </Tooltip>
                    )}
                    {preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0 && (
                      <NavigationLinks latitude={stationLocation.latitude} longitude={stationLocation.longitude} displayMode="buttons" />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 pb-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("tabs.permits")}</h3>
                <Tooltip>
                  <TooltipTrigger className="cursor-help opacity-60 transition-opacity hover:opacity-100">
                    <UKELogo className="h-3" />
                    <span className="sr-only">UKE</span>
                  </TooltipTrigger>
                  <TooltipContent>{t("permits.sourceUke")}</TooltipContent>
                </Tooltip>
              </div>
              <PermitsList permits={permits} isExternalLoading={stationLoading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

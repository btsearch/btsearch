import {
  Add01Icon,
  Cancel01Icon,
  FileSearchIcon,
  GlobalIcon,
  Globe02Icon,
  Location01Icon,
  MapsLocation01Icon,
  MountainIcon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { type CSSProperties, type HTMLAttributes, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchUkePermitsByStationId } from "@/features/map/api";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/authClient";
import { formatDayMonthYear, formatFullDate, formatRelativeTime } from "@/lib/format";
import { formatCoordinates } from "@/lib/gpsUtils";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { UkeStation } from "@/types/station";

import { fetchElevation, fetchPemReports } from "../api";
import { CopyButton } from "./copyButton";
import { NavigationLinks } from "./navLinks";
import { PermitsList } from "./permitsList";
import { ShareButton } from "./shareButton";
import { WatchButton } from "./watchButton";

type UkePermitDetailsDialogPanelProps = {
  station: UkeStation;
  onClose: () => void;
  className?: string;
  contentClassName?: string;
  contentRef?: Ref<HTMLDivElement>;
  bodyRef?: Ref<HTMLDivElement>;
  bodyContentRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  headerDragProps?: HTMLAttributes<HTMLDivElement>;
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

  const { data: permits, isLoading: permitsLoading } = useQuery({
    queryKey: ["uke-permits-by-station", station.station_id, station.operator?.mnc],
    queryFn: () => fetchUkePermitsByStationId(station.station_id, station.operator?.mnc),
    staleTime: 1000 * 60 * 5,
  });

  const { data: pemReports } = useQuery({
    queryKey: ["station-pem", station.station_id, station.location?.latitude, station.location?.longitude, station.operator?.mnc],
    queryFn: () => fetchPemReports(station.station_id, station.location!.latitude, station.location!.longitude, station.operator!.mnc!),
    staleTime: 1000 * 60 * 60,
    enabled: !!station.station_id && !!station.location && !!station.operator?.mnc,
    retry: false,
  });

  const { data: elevation } = useQuery({
    queryKey: ["elevation", station.location?.latitude, station.location?.longitude],
    queryFn: () => fetchElevation(station.location!.latitude, station.location!.longitude),
    staleTime: 1000 * 60 * 60 * 24,
    enabled: !!station.location && preferences.showElevation,
    retry: false,
  });

  const { location: stationLocation, operator, station_id } = station;
  const operatorColor = operator?.mnc ? getOperatorColor(operator.mnc) : "#3b82f6";
  const headerDragClassName = headerDragProps?.className;

  let oldestCreatedAt: string | null = null;
  let newestUpdatedAt: string | null = null;
  if (permits?.length) {
    oldestCreatedAt = permits[0].createdAt;
    newestUpdatedAt = permits[0].updatedAt;
    for (const p of permits) {
      if (p.createdAt < oldestCreatedAt) oldestCreatedAt = p.createdAt;
      if (p.updatedAt > newestUpdatedAt) newestUpdatedAt = p.updatedAt;
    }
  }

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
          <div className="h-1" style={{ backgroundColor: operatorColor }} />
          <div className="px-6 py-4 flex items-start">
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-lg font-bold tracking-tight truncate" style={{ color: operatorColor }}>
                    {operator?.name ?? t("main:unknownOperator")}
                  </h2>
                  <span className="text-sm text-muted-foreground font-mono font-medium shrink-0">{station_id}</span>
                </div>
                {stationLocation && (
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground truncate">{stationLocation.address || t("dialog.btsStation")}</p>
                    <p className="text-xs text-muted-foreground font-medium">{stationLocation.city}</p>
                    {oldestCreatedAt && newestUpdatedAt && (
                      <div className="flex flex-col items-start sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 pt-0.5">
                        <Tooltip>
                          <TooltipTrigger className="text-xs text-muted-foreground cursor-default whitespace-nowrap">
                            {tCommon("labels.created")}: {formatRelativeTime(oldestCreatedAt, tCommon)}
                          </TooltipTrigger>
                          <TooltipContent>{formatFullDate(oldestCreatedAt, i18n.language)}</TooltipContent>
                        </Tooltip>
                        <span className="hidden sm:inline text-xs text-muted-foreground/40">·</span>
                        <Tooltip>
                          <TooltipTrigger className="text-xs text-muted-foreground cursor-default whitespace-nowrap">
                            {tCommon("labels.lastSeen")}: {formatRelativeTime(newestUpdatedAt, tCommon)}
                          </TooltipTrigger>
                          <TooltipContent>{formatFullDate(newestUpdatedAt, i18n.language)}</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
              {stationLocation && (
                <>
                  <WatchButton stationId={station.id} source="uke" size="md" />
                  <ShareButton
                    title={`${operator?.name ?? "UKE"} - ${station_id}`}
                    text={`${operator?.name ?? "UKE"} ${station_id} - ${stationLocation.city}`}
                    url={`${window.location.origin}/#map=16/${stationLocation.latitude}/${stationLocation.longitude}~fu~S${station_id}`}
                    size="md"
                  />
                </>
              )}
              {isAdmin ? (
                <Link
                  to="/admin/stations/$id"
                  params={{ id: "new" }}
                  search={{ uke: station_id }}
                  className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold shadow-sm hover:bg-primary/20 transition-colors"
                  onClick={onClose}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                  <span className="hidden sm:inline">{t("dialog.createStation")}</span>
                </Link>
              ) : isLoggedIn && settings?.submissionsEnabled ? (
                <Link
                  to="/submission"
                  search={{ uke: station_id }}
                  className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold shadow-sm hover:bg-primary/20 transition-colors"
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
                className="p-2 hover:bg-muted rounded-xl transition-colors [&_svg]:pointer-events-none"
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
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">{t("specs.basicInfo")}</h3>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {stationLocation && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <HugeiconsIcon icon={Location01Icon} className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">{t("common:labels.coordinates")}:</span>
                      <span className="font-mono text-sm font-medium break-all">
                        {formatCoordinates(stationLocation.latitude, stationLocation.longitude, preferences.gpsFormat)}
                      </span>
                      <CopyButton text={`${stationLocation.latitude}, ${stationLocation.longitude}`} />
                      {preferences.navLinksDisplay === "inline" && (
                        <NavigationLinks latitude={stationLocation.latitude} longitude={stationLocation.longitude} displayMode="inline" />
                      )}
                    </div>
                  )}

                  {stationLocation?.region && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Globe02Icon} className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">{t("common:labels.region")}:</span>
                      <span className="text-sm font-medium">{stationLocation.region.name}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={Tag01Icon} className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">{t("common:labels.stationId")}:</span>
                    <span className="font-mono text-sm font-medium">{station_id}</span>
                    <div className="flex items-center gap-1">
                      <CopyButton text={station_id} />
                      {station_id && pemReports && pemReports.length > 0 ? (
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <DropdownMenuTrigger className="inline-flex items-center justify-center h-5.5 w-auto px-0.5 hover:bg-muted rounded transition-colors cursor-pointer shrink-0" />
                              }
                            >
                              <span
                                aria-hidden="true"
                                className="block h-3.5 bg-[#2e2e5a] dark:bg-[#9898ce]"
                                style={{
                                  aspectRatio: "2435/521",
                                  maskImage: "url(/si2pem.svg)",
                                  WebkitMaskImage: "url(/si2pem.svg)",
                                  maskSize: "contain",
                                  WebkitMaskSize: "contain",
                                  maskRepeat: "no-repeat",
                                  WebkitMaskRepeat: "no-repeat",
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>{t("specs.si2pemLink")}</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="start" sideOffset={4} positionerClassName="z-[9999]" className="min-w-72">
                            {pemReports?.map((report) => {
                              const Icon = report.source === "search" ? FileSearchIcon : GlobalIcon;
                              const label = report.source === "map" ? "generated" : "search";
                              return (
                                <DropdownMenuItem
                                  key={`${report.station_id}_${report.date}`}
                                  render={<a target="_blank" href={report.details.document_url} />}
                                >
                                  <HugeiconsIcon icon={Icon} className="size-4 text-muted-foreground shrink-0" />
                                  <div className="flex-1 justify-between">
                                    <span className="text-sm block">{report.details.lab_name}</span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {formatDayMonthYear(report.date)} | {tCommon(`labels.${label}`)}
                                    </span>
                                  </div>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </div>

                  {elevation !== undefined && (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={MountainIcon} className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">{t("common:labels.elevation")}:</span>
                      <span className="text-sm font-medium">{elevation} m</span>
                    </div>
                  )}

                  {stationLocation && (!isOnMap || (preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0)) && (
                    <div className="sm:col-span-2 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-1.5 flex-wrap">
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
                          <>
                            {!isOnMap && <Separator orientation="vertical" className="h-5 mx-1" />}
                            <NavigationLinks latitude={stationLocation.latitude} longitude={stationLocation.longitude} displayMode="buttons" />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 pb-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("tabs.permits")}</h3>
                <Tooltip>
                  <TooltipTrigger className="text-[10px] font-semibold text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-help tracking-widest uppercase">
                    UKE
                  </TooltipTrigger>
                  <TooltipContent>{t("permits.sourceUke")}</TooltipContent>
                </Tooltip>
              </div>
              <PermitsList permits={permits} isExternalLoading={permitsLoading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

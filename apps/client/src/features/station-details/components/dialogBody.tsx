import {
  Globe02Icon,
  InformationCircleIcon,
  Location01Icon,
  MapsLocation01Icon,
  MountainIcon,
  Radar01Icon,
  SignalFull02Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { type Ref, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RAT_ORDER } from "@/features/shared/rat";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { fetchApiData } from "@/lib/api";
import { formatCoordinates } from "@/lib/gpsUtils";
import { cn } from "@/lib/utils";
import type { Sector, Station, StationComment } from "@/types/station";

import { fetchElevation, fetchPemReports, fetchStationPhotos } from "../api";
import { TAB_OPTIONS, type TabId } from "../tabs";
import { groupCellsByRat } from "../utils";
import { CellTable } from "./cellTable";
import { CommentsList } from "./commentsList";
import { CopyButton } from "./copyButton";
import { ExtraIdentificatorsDisplay } from "./extraIdentificators";
import { NavigationLinks } from "./navLinks";
import { PermitsList } from "./permitsList";
import { PhotoGallery } from "./photoGallery";
import { SI2PEMReportsMenu } from "./si2pemReportsMenu";
import { StationInfoItem } from "./stationInfoItem";

type StationDetailsBodyProps = {
  stationId: number;
  source: "internal" | "uke";
  isLoading: boolean;
  error: unknown;
  station?: Station;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onClose: () => void;
  isAdmin?: boolean;
  bodyRef?: Ref<HTMLDivElement>;
  bodyContentRef?: Ref<HTMLDivElement>;
  onContentLayoutChange?: () => void;
};

const COMPASS_CENTER = 64;
const COMPASS_LINE_RADIUS = 48;
const COMPASS_SECTOR_RADIUS = COMPASS_CENTER;
const COMPASS_LABEL_RADIUS = Math.round(COMPASS_LINE_RADIUS * 0.6);
const OMNIDIRECTIONAL_AZIMUTH = 360;

const COMPASS_HALF_ANGLE = 20;

function getCompassPoint(azimuth: number, radius: number) {
  const radians = (azimuth * Math.PI) / 180;
  return {
    x: COMPASS_CENTER + Math.sin(radians) * radius,
    y: COMPASS_CENTER - Math.cos(radians) * radius,
  };
}

function getSectorPath(azimuth: number) {
  const left = getCompassPoint(azimuth - COMPASS_HALF_ANGLE, COMPASS_SECTOR_RADIUS);
  const right = getCompassPoint(azimuth + COMPASS_HALF_ANGLE, COMPASS_SECTOR_RADIUS);
  return `M ${COMPASS_CENTER} ${COMPASS_CENTER} L ${left.x} ${left.y} A ${COMPASS_SECTOR_RADIUS} ${COMPASS_SECTOR_RADIUS} 0 0 1 ${right.x} ${right.y} Z`;
}

function isOmnidirectionalAzimuth(azimuth: number) {
  return azimuth === OMNIDIRECTIONAL_AZIMUTH;
}

function SectorMiniCompass({ sectors }: { sectors: Sector[] }) {
  return (
    <div className="relative size-64 rounded-full border bg-background shadow-inner">
      <div className="absolute inset-3 rounded-full border border-dashed border-border" />
      <svg className="absolute inset-0 size-full overflow-visible text-primary" viewBox="0 0 128 128" aria-hidden="true">
        {sectors.map((sector) => {
          const label = getCompassPoint(sector.azimuth, COMPASS_LABEL_RADIUS);
          const isOmnidirectional = isOmnidirectionalAzimuth(sector.azimuth);
          return (
            <g key={sector.id}>
              {isOmnidirectional ? (
                <circle
                  cx={COMPASS_CENTER}
                  cy={COMPASS_CENTER}
                  r={COMPASS_SECTOR_RADIUS - 1}
                  fill="currentColor"
                  fillOpacity={0.2}
                  stroke="currentColor"
                  strokeWidth={1.5}
                />
              ) : (
                <path
                  d={getSectorPath(sector.azimuth)}
                  fill="currentColor"
                  fillOpacity={0.25}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              )}
              <text
                x={label.x}
                y={label.y}
                fill="currentColor"
                stroke="hsl(var(--background))"
                strokeWidth={3}
                paintOrder="stroke"
                fontSize="9"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {sector.azimuth}°
              </text>
            </g>
          );
        })}
      </svg>
      <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-sm" />
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-medium text-muted-foreground">N</span>
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">S</span>
      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">W</span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">E</span>
    </div>
  );
}

export function StationDetailsBody({
  stationId,
  source,
  isLoading,
  error,
  station,
  activeTab,
  onTabChange,
  onClose,
  isAdmin = false,
  bodyRef,
  bodyContentRef,
  onContentLayoutChange,
}: StationDetailsBodyProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const { data: settings } = useSettings();
  const { preferences } = usePreferences();
  const location = useLocation();
  const [displayedTab, setDisplayedTab] = useState<TabId>(activeTab);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    setDisplayedTab(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: TabId) => {
    if (tab === displayedTab) return;

    skipNextSyncRef.current = true;
    onTabChange(tab);
    setDisplayedTab(tab);
  };
  const isOnMap = location.pathname === "/" || location.pathname.startsWith("/lists/");
  const cellGroups = useMemo(() => (station ? groupCellsByRat(station.cells ?? []) : {}), [station]);
  const sectorInfoById = useMemo(
    () => new Map((station?.sectors ?? []).map((sector, index) => [sector.id, { label: `A${index + 1}`, azimuth: sector.azimuth }])),
    [station?.sectors],
  );

  const { data: photos } = useQuery({
    queryKey: ["station-photos", stationId],
    queryFn: () => fetchStationPhotos(stationId),
    staleTime: 1000 * 60 * 5,
    enabled: source === "internal" && !!settings?.photosEnabled,
  });

  const { data: comments } = useQuery({
    queryKey: ["station-comments", stationId],
    queryFn: () => fetchApiData<StationComment[]>(`stations/${stationId}/comments`, { allowedErrors: [404, 403] }).then((data) => data ?? []),
    staleTime: 1000 * 60 * 5,
    enabled: source === "internal" && !!settings?.enableStationComments,
  });

  const { data: pemReports } = useQuery({
    queryKey: ["station-pem", station?.station_id, station?.location.latitude, station?.location.longitude, station?.operator?.mnc],
    queryFn: () => fetchPemReports(station!.station_id, station!.location.latitude, station!.location.longitude, station!.operator.mnc),
    staleTime: 1000 * 60 * 60,
    enabled: source === "internal" && !!station?.station_id,
    retry: false,
  });

  const { data: elevation } = useQuery({
    queryKey: ["elevation", station?.location.latitude, station?.location.longitude],
    queryFn: () => fetchElevation(station!.location.latitude, station!.location.longitude),
    staleTime: 1000 * 60 * 60 * 24,
    enabled: source === "internal" && !!station?.location && preferences.showElevation,
    retry: false,
  });

  useLayoutEffect(() => {
    onContentLayoutChange?.();
  }, [displayedTab, station?.id, photos?.length, comments?.length, pemReports?.length, elevation, onContentLayoutChange]);

  const tabCounts: Partial<Record<TabId, number>> = {
    ...(station?.sectors && station.sectors.length > 0 ? { sectors: station.sectors.length } : {}),
    ...(photos !== undefined ? { photos: photos.length } : {}),
    ...(comments !== undefined ? { comments: comments.length } : {}),
  };
  const showSI2PEMLink =
    !!station?.station_id && !(station.station_id.startsWith("N") && (station.operator.mnc === 26002 || station.operator.mnc === 26003));
  const visibleTabs = useMemo(
    () =>
      source === "uke"
        ? TAB_OPTIONS.filter((tab) => tab.id === "permits")
        : TAB_OPTIONS.filter((tab) => {
            if (tab.id === "sectors" && (station?.sectors?.length ?? 0) === 0) return false;
            if (tab.id === "comments" && !settings?.enableStationComments) return false;
            if (tab.id === "photos" && !settings?.photosEnabled) return false;
            return true;
          }),
    [source, settings?.enableStationComments, settings?.photosEnabled, station?.sectors?.length],
  );
  const tabCount = Math.max(visibleTabs.length, 1);
  const activeTabIndex = Math.max(
    0,
    visibleTabs.findIndex((tab) => tab.id === displayedTab),
  );
  const tabGapRem = 0.25;
  const tabPillAvailableOffsetRem = 0.5 + (tabCount - 1) * tabGapRem;
  const tabPillTransform =
    activeTabIndex === 0 ? "translate3d(0, 0, 0)" : `translate3d(calc(${activeTabIndex * 100}% + ${activeTabIndex * tabGapRem}rem), 0, 0)`;

  return (
    <div ref={bodyRef} className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable">
      <div ref={bodyContentRef}>
        {isLoading ? (
          <div className="px-3 py-4 space-y-6 sm:p-6 sm:space-y-8">
            <div className="flex gap-1 rounded-full bg-muted/60 p-1 ring-1 ring-inset ring-border/50">
              {[1, 2, 3].map((i) => (
                <div key={`skeleton-tab-${i}`} className="flex-1 flex items-center justify-center gap-2 py-2 px-2 sm:px-3">
                  <Skeleton className="size-5 rounded sm:size-4" />
                  <Skeleton className="h-4 w-16 rounded hidden sm:block" />
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <Skeleton className="h-4 w-32 rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 p-4 border rounded-xl">
                {[1, 2, 3, 4].map((i) => (
                  <div key={`skeleton-field-${i}`} className="flex items-center gap-2">
                    <Skeleton className="size-4 rounded shrink-0" />
                    <Skeleton className="h-3 w-20 rounded" />
                    <Skeleton className="h-3 w-24 rounded ml-auto" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <Skeleton className="h-4 w-24 rounded" />
              {[1, 2].map((i) => (
                <div key={`skeleton-card-${i}`} className="rounded-xl border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className="h-4 w-12 rounded" />
                    <Skeleton className="h-3 w-16 rounded ml-auto" />
                  </div>
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((j) => (
                      <div key={`skeleton-row-${j}`} className="flex gap-4">
                        <Skeleton className="h-4 w-20 rounded" />
                        <Skeleton className="h-4 w-16 rounded" />
                        <Skeleton className="h-4 w-32 rounded" />
                        <Skeleton className="h-4 w-24 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
              <HugeiconsIcon icon={InformationCircleIcon} className="size-6" />
            </div>
            <p className="text-muted-foreground max-w-xs">{error instanceof Error ? error.message : t("common:placeholder.errorFetching")}</p>
          </div>
        ) : station ? (
          <div className="px-3 py-4 space-y-6 sm:p-6 sm:space-y-8">
            <div
              className="relative grid gap-1 rounded-full bg-muted/60 p-1 ring-1 ring-inset ring-border/50"
              style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
            >
              {visibleTabs.length > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-full bg-background shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none"
                  style={{
                    width: `calc((100% - ${tabPillAvailableOffsetRem}rem) / ${tabCount})`,
                    transform: tabPillTransform,
                  }}
                />
              )}
              {visibleTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "relative flex min-w-0 items-center justify-center gap-2 rounded-full px-2 py-2 text-sm font-medium transition-colors duration-200 sm:px-3",
                    displayedTab === tab.id ? "text-primary" : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon icon={tab.icon} className="size-5 sm:size-4" />
                  <span className="hidden sm:inline">{t(`tabs.${tab.id}`)}</span>
                  {tabCounts[tab.id] !== undefined && tabCounts[tab.id]! > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold bg-primary text-primary-foreground leading-none animate-in fade-in zoom-in-50 duration-200">
                      {tabCounts[tab.id]! > 99 ? "99+" : tabCounts[tab.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div>
              {source === "internal" ? (
                <>
                  {displayedTab === "specs" && (
                    <div className="space-y-8">
                      <section>
                        <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
                          <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
                            <span className="font-mono break-all">
                              {formatCoordinates(station.location.latitude, station.location.longitude, preferences.gpsFormat)}
                            </span>
                            <CopyButton text={`${station?.location.latitude}, ${station?.location.longitude}`} />
                            {preferences.navLinksDisplay === "inline" && (
                              <NavigationLinks latitude={station.location.latitude} longitude={station.location.longitude} displayMode="inline" />
                            )}
                          </StationInfoItem>
                          <StationInfoItem icon={<HugeiconsIcon icon={Globe02Icon} className="size-4" />} label={t("common:labels.region")}>
                            <span>{station.location.region?.name || "-"}</span>
                          </StationInfoItem>
                          <StationInfoItem icon={<HugeiconsIcon icon={Tag01Icon} className="size-4" />} label={t("common:labels.stationId")}>
                            <span className="font-mono">{station.station_id}</span>
                            <CopyButton text={station.station_id || ""} />
                          </StationInfoItem>
                          {showSI2PEMLink && pemReports && pemReports.length > 0 ? (
                            <StationInfoItem icon={<HugeiconsIcon icon={Radar01Icon} className="size-4" />} label={t("specs.pemReports")}>
                              <SI2PEMReportsMenu
                                reports={pemReports}
                                latitude={station.location.latitude}
                                longitude={station.location.longitude}
                                operatorName={station.operator.name}
                                operatorMnc={station.operator.mnc}
                              />
                            </StationInfoItem>
                          ) : null}
                          {station.extra_identificators && (
                            <ExtraIdentificatorsDisplay data={station.extra_identificators} operatorMnc={station.operator?.mnc} />
                          )}
                          {elevation !== undefined && (
                            <StationInfoItem icon={<HugeiconsIcon icon={MountainIcon} className="size-4" />} label={t("common:labels.elevation")}>
                              <span>{elevation} m</span>
                            </StationInfoItem>
                          )}
                          {(!isOnMap || (preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0)) && (
                            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3 sm:col-span-2">
                              {!isOnMap && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Link
                                        to="/"
                                        hash={`map=16/${station.location.latitude}/${station.location.longitude}~f~L${station.location.id}`}
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
                                <NavigationLinks latitude={station.location.latitude} longitude={station.location.longitude} displayMode="buttons" />
                              )}
                            </div>
                          )}
                        </div>
                      </section>

                      <section>
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("specs.cellDetails")}</h3>
                        {Object.keys(cellGroups).length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                            <HugeiconsIcon icon={SignalFull02Icon} className="size-8 mb-2 opacity-20" />
                            <p className="text-sm">{t("stations:cells.noStationCells")}</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {RAT_ORDER.filter((rat) => cellGroups[rat]).map((rat) => (
                              <CellTable key={rat} rat={rat} cells={cellGroups[rat]} sectorInfoById={sectorInfoById} />
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  )}

                  {displayedTab === "sectors" && (station.sectors?.length ?? 0) > 0 && (
                    <div>
                      <section className="flex min-h-72 flex-col items-center justify-center gap-4">
                        <SectorMiniCompass sectors={station.sectors ?? []} />
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {(station.sectors ?? []).map((sector, index) => (
                            <span key={sector.id} className="text-xs font-medium text-muted-foreground tabular-nums">
                              A{index + 1}: {sector.azimuth}°
                            </span>
                          ))}
                        </div>
                      </section>
                    </div>
                  )}

                  {displayedTab === "permits" && (
                    <div>
                      <section>
                        <PermitsList stationId={stationId} />
                      </section>
                    </div>
                  )}

                  {displayedTab === "comments" && (
                    <div>
                      <section>
                        <CommentsList stationId={stationId} isAdmin={isAdmin} />
                      </section>
                    </div>
                  )}

                  {displayedTab === "photos" && (
                    <div>
                      <section>
                        <PhotoGallery stationId={stationId} isAdmin={isAdmin} />
                      </section>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <section>
                    <PermitsList stationId={stationId} isUkeSource />
                  </section>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { InformationCircleIcon, SignalFull02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchStationPhotos } from "../api";
import { TAB_OPTIONS, type TabId } from "../tabs";
import { groupCellsByRat } from "../utils";
import { AddCommentForm } from "./addCommentForm";
import { CellTable } from "./cellTable";
import { CommentsList } from "./commentsList";
import { PermitsList } from "./permitsList";
import { PhotoGallery } from "./photoGallery";
import { SectorMiniCompass } from "./sectorMiniCompass";
import { StationInfoCard } from "./stationInfoCard";
import { Skeleton } from "@/components/ui/skeleton";
import { RAT_ORDER } from "@/features/shared/rat";
import { useSettings } from "@/hooks/useSettings";
import { fetchApiData } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import type { Station, StationComment } from "@/types/station";

type StationDetailsBodyProps = {
  stationId: number;
  isLoading: boolean;
  error: unknown;
  station?: Station;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onClose: () => void;
  isAdmin?: boolean;
  onContentLayoutChange?: () => void;
};

export function StationDetailsBody({
  stationId,
  isLoading,
  error,
  station,
  activeTab,
  onTabChange,
  onClose,
  isAdmin = false,
  onContentLayoutChange,
}: StationDetailsBodyProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
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
  const cellGroups = useMemo(() => (station ? groupCellsByRat(station.cells ?? []) : {}), [station]);
  const sectorInfoById = useMemo(
    () => new Map((station?.sectors ?? []).map((sector, index) => [sector.id, { label: `A${index + 1}`, azimuth: sector.azimuth }])),
    [station?.sectors],
  );

  const { data: photos } = useQuery({
    queryKey: ["station-photos", stationId],
    queryFn: () => fetchStationPhotos(stationId),
    staleTime: 1000 * 60 * 5,
    enabled: !!settings?.photosEnabled,
  });

  const {
    data: comments,
    isLoading: commentsLoading,
    error: commentsError,
  } = useQuery({
    queryKey: ["station-comments", stationId, currentUserId],
    queryFn: () => fetchApiData<StationComment[]>(`stations/${stationId}/comments`, { allowedErrors: [404, 403] }).then((data) => data ?? []),
    staleTime: 1000 * 60 * 5,
    enabled: !!settings?.enableStationComments,
  });

  useLayoutEffect(() => {
    onContentLayoutChange?.();
  }, [displayedTab, station?.id, photos?.length, comments?.length, onContentLayoutChange]);

  const tabCounts: Partial<Record<TabId, number>> = {
    ...(station?.sectors && station.sectors.length > 0 ? { sectors: station.sectors.length } : {}),
    ...(photos !== undefined ? { photos: photos.length } : {}),
    ...(comments !== undefined ? { comments: comments.length } : {}),
  };
  const visibleTabs = useMemo(
    () =>
      TAB_OPTIONS.filter((tab) => {
        if (tab.id === "sectors" && (station?.sectors?.length ?? 0) === 0) return false;
        if (tab.id === "comments" && !settings?.enableStationComments) return false;
        if (tab.id === "photos" && !settings?.photosEnabled) return false;
        return true;
      }),
    [settings?.enableStationComments, settings?.photosEnabled, station?.sectors?.length],
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

  if (isLoading) return <StationDetailsSkeleton />;
  if (error) return <StationDetailsError error={error} />;
  if (!station) return null;

  return (
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
        {displayedTab === "specs" && (
          <div className="space-y-8">
            <StationInfoCard
              source="internal"
              stationCode={station.station_id}
              operator={station.operator}
              location={station.location}
              showPemReports={!station.physicalStation}
              uplink={station.uplink}
              extraIdentificators={station.extra_identificators}
              onClose={onClose}
              onLayoutChange={onContentLayoutChange}
            />

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
              <PermitsList stationId={stationId} physicalStation={station.physicalStation} />
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

        {settings?.enableStationComments && session?.user && (
          <div
            className={cn(
              "mt-5",
              (comments?.length ?? 0) > 0 && "border-t border-border/60 pt-5",
              (displayedTab !== "comments" || commentsLoading || !!commentsError) && "hidden",
            )}
          >
            <AddCommentForm key={`${stationId}:${currentUserId}`} stationId={stationId} />
          </div>
        )}

        {displayedTab === "photos" && (
          <div>
            <section>
              <PhotoGallery stationId={stationId} isAdmin={isAdmin} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function StationDetailsSkeleton() {
  return (
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
  );
}

export function StationDetailsError({ error }: { error: unknown }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-4">
        <HugeiconsIcon icon={InformationCircleIcon} className="size-6" />
      </div>
      <p className="text-muted-foreground max-w-xs">{error instanceof Error ? error.message : t("placeholder.errorFetching")}</p>
    </div>
  );
}

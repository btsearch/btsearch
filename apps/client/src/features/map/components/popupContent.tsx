import { Image01Icon, Share08Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy, memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Lightbox } from "@/components/lightbox";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLocationPhotos } from "@/features/station-details/api";
import { TerrainProfileAnalyzeButton } from "@/features/terrain-profile/components/terrainProfileAnalyzeButton";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { usePreferences } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/gpsUtils";
import { getOperatorColor } from "@/lib/operatorUtils";
import type { LocationInfo, StationSource, StationWithoutCells, UkeStation } from "@/types/station";

import { getPermitBands, getStationBands } from "../utils";
import { TechnologySummary } from "./technologySummary";

const AddToListPopover = lazy(() => import("@/features/lists/components/addToListPopover").then((m) => ({ default: m.AddToListPopover })));

type PopupStationListProps = {
  isLoading: boolean;
  isEmpty: boolean;
  isUkeSource: boolean;
  ukeStations?: UkeStation[] | null;
  stations: StationWithoutCells[] | null;
  showAddToList: boolean;
  location: LocationInfo;
  onOpenStationDetails: (id: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

function getPopupOperatorGradient(color: string): string {
  return `linear-gradient(115deg, ${color}18 0%, ${color}08 38%, transparent 72%)`;
}

function PopupStationList({
  isLoading,
  isEmpty,
  isUkeSource,
  ukeStations,
  stations,
  showAddToList,
  location,
  onOpenStationDetails,
  onOpenUkeStationDetails,
  onStartTerrainProfile,
}: PopupStationListProps) {
  const { t } = useTranslation(["main", "stationDetails"]);

  if (isLoading) {
    return (
      <>
        <StationSkeleton />
        <StationSkeleton />
      </>
    );
  }
  if (isEmpty) {
    return <div className="px-3 py-4 text-center text-muted-foreground text-xs">{isUkeSource ? t("popup.noPermits") : t("popup.noStations")}</div>;
  }
  if (isUkeSource && ukeStations) {
    return ukeStations.map((station) => {
      const mnc = station.operator?.mnc;
      const operatorName = station.operator?.name || t("unknownOperator");
      const color = mnc ? getOperatorColor(mnc) : "#3b82f6";
      const bands = getPermitBands(station.permits);
      const permitCount = `${station.permits.length} ${station.permits.length === 1 ? t("stationDetails:permits.permit") : t("stationDetails:permits.permits")}`;

      return (
        <button
          type="button"
          key={station.station_id}
          className="w-full cursor-pointer border-b border-border/30 px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted/50"
          onClick={() => onOpenUkeStationDetails(station)}
          style={{ backgroundImage: getPopupOperatorGradient(color) }}
        >
          <div className="flex items-center gap-1.5">
            <div className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
            <span className="font-medium text-xs">{operatorName}</span>
            <span className="text-[10px] text-foreground/70 font-mono">{station.station_id}</span>
          </div>
          <TechnologySummary bands={bands} detail={permitCount} />
        </button>
      );
    });
  }
  if (stations) {
    return stations.map((station) => {
      const mnc = station.operator?.mnc;
      const operatorName = station.operator?.name || t("unknownOperator");
      const stationId = station.station_id;
      const color = mnc ? getOperatorColor(mnc) : "#3b82f6";
      const hasCells = station.cells !== undefined;
      const showTechnologySummary = station.status !== "pending";
      const bands = hasCells && station.cells?.length ? getStationBands(station.cells) : [];
      let technologySummary = null;
      if (showTechnologySummary) technologySummary = hasCells ? <TechnologySummary bands={bands} /> : <TechnologySummarySkeleton />;

      return (
        <div key={station.id} className="relative border-b border-border/30 last:border-0">
          <button
            type="button"
            className="w-full cursor-pointer px-3 py-2 text-left transition-colors hover:bg-muted/50"
            onClick={() => onOpenStationDetails(station.id)}
            style={{ backgroundImage: getPopupOperatorGradient(color) }}
          >
            <div className="flex items-center gap-1.5">
              <div className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
              <span className="font-medium text-xs">{operatorName}</span>
              <span className="text-[11px] text-foreground/70">{stationId}</span>
              {station.extra_identificators?.networks_id && (
                <span className="text-[11px] text-foreground/70 font-mono">N!{station.extra_identificators.networks_id}</span>
              )}
            </div>
            {technologySummary}
          </button>
          {onStartTerrainProfile && (
            <div className="absolute top-2 right-2">
              <TerrainProfileAnalyzeButton
                target={{
                  source: "internal",
                  id: station.id,
                  stationId,
                  operatorName,
                  latitude: location.latitude,
                  longitude: location.longitude,
                }}
                onStart={onStartTerrainProfile}
              />
            </div>
          )}
        </div>
      );
    });
  }
  return null;
}

type PopupContentProps = {
  location: LocationInfo;
  stations: StationWithoutCells[] | null;
  ukeStations?: UkeStation[] | null;
  source: StationSource;
  showAddToList?: boolean;
  onOpenStationDetails: (id: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

function StationSkeleton() {
  return (
    <div className="px-3 py-2 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-1.5">
        <Skeleton className="size-2 rounded-[2px]" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-2.5 w-12" />
      </div>
      <TechnologySummarySkeleton />
    </div>
  );
}

function TechnologySummarySkeleton() {
  return (
    <div className="mt-1.5 flex gap-2 pl-3.5">
      <Skeleton className="h-[11px] w-8 rounded-sm" />
      <Skeleton className="h-[11px] w-24 rounded-sm" />
    </div>
  );
}

function PopupShareButton({ location, source }: { location: LocationInfo; source: StationSource }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/#map=16/${location.latitude}/${location.longitude}~L${location.id}${source === "uke" ? "~fu" : "~f"}`;

  const handleShare = useCallback(() => {
    if (navigator.share) {
      void navigator
        .share({
          title: `${location.city}${location.address ? ` - ${location.address}` : ""}`,
          url: shareUrl,
        })
        .then(() => {})
        .catch((error: unknown) => {
          if ((error as Error).name === "AbortError") return;
        });
      return;
    }

    void navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((error) => {
        console.error("Failed to copy:", error);
      });
  }, [location, shareUrl]);

  return (
    <button
      type="button"
      onClick={handleShare}
      className="p-0.5 hover:bg-muted rounded transition-colors cursor-pointer shrink-0"
      aria-label="Share location"
    >
      {copied ? (
        <HugeiconsIcon icon={Tick02Icon} className="size-3 text-emerald-500" />
      ) : (
        <HugeiconsIcon icon={Share08Icon} className="size-3 text-muted-foreground" />
      )}
    </button>
  );
}

function PopupPhotosButton({ locationId }: { locationId: number }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { data: photos = [] } = useQuery({
    queryKey: ["location-photos", locationId],
    queryFn: () => fetchLocationPhotos(locationId),
    staleTime: 1000 * 60 * 5,
  });

  const closeLightbox = () => setLightboxIndex(null);
  const prev = useCallback(() => setLightboxIndex((i) => (i !== null ? (i - 1 + photos.length) % photos.length : null)), [photos.length]);
  const next = useCallback(() => setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null)), [photos.length]);

  if (photos.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxIndex(0)}
        className="flex items-center gap-0.5 p-0.5 hover:bg-muted rounded transition-colors cursor-pointer shrink-0"
        aria-label={`View ${photos.length} photos`}
      >
        <HugeiconsIcon icon={Image01Icon} className="size-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground tabular-nums">{photos.length}</span>
      </button>
      <Lightbox photos={photos} index={lightboxIndex} onClose={closeLightbox} onPrev={prev} onNext={next} />
    </>
  );
}

export const PopupContent = memo(function PopupContent({
  location,
  stations,
  ukeStations,
  source,
  showAddToList = false,
  onOpenStationDetails,
  onOpenUkeStationDetails,
  onStartTerrainProfile,
}: PopupContentProps) {
  const { preferences } = usePreferences();

  const isUkeSource = source === "uke";
  const items = isUkeSource ? ukeStations : stations;
  const isLoading = !items;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="w-72 text-sm">
      <div className="px-3 py-2 border-b border-border/50">
        <h3 className="font-medium text-sm leading-tight pr-4">
          {location.city}
          {location.region && <span className="font-normal text-[11px] text-muted-foreground ml-1">· {location.region}</span>}
        </h3>
        {location.address && <p className="text-[11px] text-muted-foreground">{location.address}</p>}
      </div>

      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        <PopupStationList
          isLoading={isLoading}
          isEmpty={isEmpty}
          isUkeSource={isUkeSource}
          ukeStations={ukeStations}
          stations={stations}
          showAddToList={showAddToList}
          location={location}
          onOpenStationDetails={onOpenStationDetails}
          onOpenUkeStationDetails={onOpenUkeStationDetails}
          onStartTerrainProfile={onStartTerrainProfile}
        />
      </div>

      <div className="px-3 py-1.5 border-t border-border/50 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-mono">
          GPS: {formatCoordinates(location.latitude, location.longitude, preferences.gpsFormat)}
        </span>
        <div className="flex items-center gap-1.5">
          {!isUkeSource && <PopupPhotosButton locationId={location.id} />}
          {isUkeSource && showAddToList && (
            <Suspense>
              <AddToListPopover ukeLocationId={location.id} />
            </Suspense>
          )}
          <PopupShareButton location={location} source={source} />
        </div>
      </div>
    </div>
  );
});

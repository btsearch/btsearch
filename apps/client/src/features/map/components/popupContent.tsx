import { Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import { getPermitBands, getStationBands, isUkeStationExpired } from "../utils";
import {
  PopupAddToListButton,
  PopupCoordinatesFooter,
  PopupExpiredLabel,
  PopupIconButton,
  PopupLocationHeader,
  PopupOperatorName,
  PopupRow,
  PopupShareButton,
  PopupStationId,
} from "./popupParts";
import { TechnologySummary } from "./technologySummary";
import { useLightbox } from "@/components/lightbox";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
import { CloseButton } from "@/components/ui/close-button";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLocationPhotos } from "@/features/station-details/api";
import { VirtualStationBadge } from "@/features/station-details/components/virtualStationBadge";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import type { LocationInfo, StationSource, StationWithoutCells, UkeStation } from "@/types/station";

type PopupStationListProps = {
  isLoading: boolean;
  isEmpty: boolean;
  loadFailed: boolean;
  isUkeSource: boolean;
  ukeStations?: UkeStation[] | null;
  stations: StationWithoutCells[] | null;
  showAddToList: boolean;
  onOpenStationDetails: (id: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
};

function PopupStationList({
  isLoading,
  isEmpty,
  loadFailed,
  isUkeSource,
  ukeStations,
  stations,
  showAddToList,
  onOpenStationDetails,
  onOpenUkeStationDetails,
}: PopupStationListProps) {
  const { t } = useTranslation(["main", "stationDetails"]);
  const actionCount = showAddToList ? 1 : 0;

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
    return ukeStations.map((station) => (
      <PopupRow
        key={station.id}
        mnc={station.operator?.mnc}
        onOpen={() => onOpenUkeStationDetails(station)}
        title={
          <>
            <PopupOperatorName name={station.operator?.name || t("unknownOperator")} />
            <PopupStationId id={station.station_id} />
            {isUkeStationExpired(station) ? <PopupExpiredLabel /> : null}
          </>
        }
        actionCount={actionCount}
        actions={showAddToList ? <PopupAddToListButton ukeStationId={station.id} /> : null}
      >
        <TechnologySummary
          bands={getPermitBands(station.permits)}
          detail={t("stationDetails:permits.permitsCount", { count: station.permits.length })}
          className="pl-0"
        />
      </PopupRow>
    ));
  }
  if (stations) {
    return stations.map((station) => {
      const hasCells = station.cells !== undefined;
      const networksId = station.extra_identificators?.networks_id;
      let technologySummary = null;
      if (station.status !== "pending" && hasCells)
        technologySummary = <TechnologySummary bands={station.cells?.length ? getStationBands(station.cells) : []} className="pl-0" />;
      else if (station.status !== "pending" && !loadFailed) technologySummary = <TechnologySummarySkeleton />;

      return (
        <PopupRow
          key={station.id}
          mnc={station.operator?.mnc}
          onOpen={() => onOpenStationDetails(station.id)}
          title={
            <>
              <PopupOperatorName name={station.operator?.name || t("unknownOperator")} />
              <PopupStationId id={station.station_id} />
              {networksId ? <span className="font-mono text-[11px] text-foreground/70">N!{networksId}</span> : null}
              <VirtualStationBadge station={station} onOpenStation={onOpenStationDetails} compact />
              {station.status !== undefined && station.status !== "published" ? (
                <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} />
              ) : null}
            </>
          }
          actionCount={actionCount}
          actions={showAddToList ? <PopupAddToListButton stationId={station.id} /> : null}
        >
          {technologySummary}
        </PopupRow>
      );
    });
  }
  return null;
}

function StationSkeleton() {
  return (
    <div className="flex gap-1.5 border-b border-border/30 px-3 py-2 last:border-0">
      <Skeleton className="size-4 shrink-0 rounded-[3px]" />
      <div className="min-w-0 flex-1">
        <div className="flex h-4 items-center gap-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-10" />
        </div>
        <TechnologySummarySkeleton />
      </div>
    </div>
  );
}

function TechnologySummarySkeleton() {
  return (
    <div className="mt-1 flex h-4 items-center gap-2">
      <Skeleton className="h-2.5 w-8 rounded-sm" />
      <Skeleton className="h-2.5 w-24 rounded-sm" />
    </div>
  );
}

function PopupPhotosButton({ locationId }: { locationId: number }) {
  const { t } = useTranslation("main");
  const lightbox = useLightbox();

  const { data: photos = [] } = useQuery({
    queryKey: ["location-photos", locationId],
    queryFn: () => fetchLocationPhotos(locationId),
    staleTime: 1000 * 60 * 5,
  });

  if (photos.length === 0) return null;

  return (
    <>
      <PopupIconButton label={t("photos.stationPhotoCount", { count: photos.length })} size="xs" className="px-1.5" {...lightbox.getTriggerProps(0)}>
        <HugeiconsIcon icon={Image01Icon} />
        <span className="tabular-nums">{photos.length}</span>
      </PopupIconButton>
      <PhotoLightbox photos={photos} {...lightbox.lightboxProps} />
    </>
  );
}

type PopupContentProps = {
  location: LocationInfo;
  stations: StationWithoutCells[] | null;
  ukeStations?: UkeStation[] | null;
  source: StationSource;
  showAddToList?: boolean;
  loadFailed?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onOpenStationDetails: (id: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
};

export const PopupContent = memo(function PopupContent({
  location,
  stations,
  ukeStations,
  source,
  showAddToList = false,
  loadFailed = false,
  isRetrying = false,
  onRetry,
  onClose,
  onOpenStationDetails,
  onOpenUkeStationDetails,
}: PopupContentProps) {
  const { t } = useTranslation("main");

  const isUkeSource = source === "uke";
  const items = isUkeSource ? ukeStations : stations;
  const isLoading = !items;
  const isEmpty = !isLoading && items.length === 0;
  const shareUrl = `${window.location.origin}/#map=16/${location.latitude}/${location.longitude}~L${location.id}${isUkeSource ? "~fu" : "~f"}`;
  const city = location.city || t("common:labels.unknownLocation");
  const shareTitle = location.address ? `${city} - ${location.address}` : city;

  return (
    <div className="w-72 text-sm">
      <PopupLocationHeader
        city={location.city}
        region={location.region}
        address={location.address}
        actions={
          <>
            {isUkeSource ? null : <PopupPhotosButton locationId={location.id} />}
            <PopupShareButton url={shareUrl} title={shareTitle} label={t("popup.shareLocation")} />
            <CloseButton size="xs" onClick={onClose} />
          </>
        }
      />

      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        {loadFailed ? <InlineError size="sm" title={t("popup.loadError")} onRetry={onRetry} isRetrying={isRetrying} className="m-1" /> : null}
        <PopupStationList
          isLoading={isLoading && !loadFailed}
          isEmpty={isEmpty}
          loadFailed={loadFailed}
          isUkeSource={isUkeSource}
          ukeStations={ukeStations}
          stations={stations}
          showAddToList={showAddToList}
          onOpenStationDetails={onOpenStationDetails}
          onOpenUkeStationDetails={onOpenUkeStationDetails}
        />
      </div>

      <PopupCoordinatesFooter latitude={location.latitude} longitude={location.longitude} />
    </div>
  );
});

import { ArrowUpRight01Icon, Image01Icon, Link02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Cell } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type MouseEvent, type RefObject, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { type MapLookups, getOperatorLook } from "../data/mapLookups";
import type { MapPlace, MapPointStation } from "../data/mapPoints";
import { getCellTechnologyBands, getPermitBands, isUkeStationExpired } from "../utils";
import {
  PopupAddToListButton,
  PopupBrandMark,
  PopupCoordinatesFooter,
  PopupExpiredLabel,
  PopupIconButton,
  PopupLocationHeader,
  PopupOperatorName,
  PopupRow,
  PopupShareButton,
  PopupStationId,
  PopupStatusBadge,
} from "./popupParts";
import { TechnologySummary } from "./technologySummary";
import { useLightbox } from "@/components/lightbox";
import { PhotoLightbox } from "@/components/photos/photoLightbox";
import { CloseButton } from "@/components/ui/close-button";
import { InlineError } from "@/components/ui/error-state";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { RanSharingLink } from "@/features/station-details/components/ranSharingLink";
import { locationPhotoRecordsQueryOptions } from "@/features/station-details/station/api";
import { StationStructureLine } from "@/features/station-details/station/components/panel/stationStructureLine";
import { NETWORKS_ID_KIND, findHostStation, findStationIdentifier } from "@/features/station-details/station/utils/stations";
import { getStructureOwnerBrand } from "@/features/station-details/station/utils/structure";
import { getOperatorTintGradient } from "@/lib/cellular/operators";
import { hasModifierKey } from "@/lib/dom/keyboard";
import { cn } from "@/lib/utils";
import type { StationSource, UkeStation } from "@/types/station";

export type PopupStationEntry = MapPointStation & { cells: readonly Cell[] | null };

const HOSTED_BADGE_HOVER_DELAY_MS = 150;
const HOSTED_BADGE_CLASS_NAME = cn(
  "inline-flex shrink-0 cursor-help items-center gap-1 rounded-sm font-mono text-[11px] text-foreground/70 outline-none transition-colors",
  "hover:text-foreground data-[popup-open]:text-foreground",
  "group-has-[[data-hosted-badge-button]:focus-visible]/popup-row:text-foreground",
  "group-has-[[data-hosted-badge-button]:focus-visible]/popup-row:ring-2",
  "group-has-[[data-hosted-badge-button]:focus-visible]/popup-row:ring-ring",
);

type PopupHostStationLinkProps = {
  station: MapPointStation;
  onOpen: (stationId: number) => void;
};

function PopupHostStationLink({ station, onOpen }: PopupHostStationLinkProps) {
  const { t } = useTranslation("main");

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hasModifierKey(event)) return;
    event.preventDefault();
    onOpen(station.id);
  };

  return (
    <a
      href={`/stations/${station.id}`}
      onClick={handleClick}
      className="group flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ backgroundImage: getOperatorTintGradient(station.color) }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <PopupBrandMark brand={station.brand} color={station.color} />
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{station.operatorName || t("unknownOperator")}</span>
      </span>
      <span className="shrink-0 font-mono text-xs font-medium text-foreground tabular-nums">{station.siteId}</span>
      <PopupStatusBadge status={station.status} />
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
        aria-hidden="true"
      />
    </a>
  );
}

type PopupHostedStationCardProps = {
  hostStation: MapPointStation | null;
  isHostLoading: boolean;
  anchor?: RefObject<HTMLElement | null>;
  onOpenHost: (stationId: number) => void;
};

function PopupHostedStationCard({ hostStation, isHostLoading, anchor, onOpenHost }: PopupHostedStationCardProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <PopoverContent side="top" align="start" anchor={anchor} className="w-64 gap-2 p-2.5">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon icon={Link02Icon} className="size-3.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
        <PopoverTitle className="text-xs font-semibold">{t("dialog.virtualStationTitle")}</PopoverTitle>
      </div>
      <PopoverDescription className="text-[11px] leading-snug">
        <Trans t={t} i18nKey="dialog.virtualStationPhysical" components={{ ranSharingLink: <RanSharingLink /> }} />
      </PopoverDescription>
      {hostStation !== null ? <PopupHostStationLink station={hostStation} onOpen={onOpenHost} /> : null}
      {hostStation === null && isHostLoading ? (
        <output className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5" aria-label={t("common:actions.loading")}>
          <Skeleton className="size-4 rounded-[3px]" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </output>
      ) : null}
    </PopoverContent>
  );
}

type PopupHostedStationProps = {
  badgeRef: RefObject<HTMLElement | null>;
  hostStation: MapPointStation | null;
  isHostLoading: boolean;
  onOpenStation: (stationId: number) => boolean | void;
};

function PopupHostedStationBadge({ badgeRef, hostStation, isHostLoading, onOpenStation }: PopupHostedStationProps) {
  const { t } = useTranslation("stationDetails");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        ref={(badge: HTMLElement | null) => {
          badgeRef.current = badge;
        }}
        openOnHover
        delay={HOSTED_BADGE_HOVER_DELAY_MS}
        nativeButton={false}
        render={<span />}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={HOSTED_BADGE_CLASS_NAME}
      >
        <HugeiconsIcon icon={Link02Icon} className="size-3" aria-hidden="true" />
        {t("dialog.virtualStation")}
      </PopoverTrigger>
      <PopupHostedStationCard
        hostStation={hostStation}
        isHostLoading={isHostLoading}
        onOpenHost={(stationId) => {
          setIsOpen(false);
          onOpenStation(stationId);
        }}
      />
    </Popover>
  );
}

function PopupHostedStationButton({ badgeRef, hostStation, isHostLoading, onOpenStation }: PopupHostedStationProps) {
  const { t } = useTranslation("stationDetails");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger type="button" data-hosted-badge-button className="sr-only">
        {t("dialog.virtualStation")}
      </PopoverTrigger>
      <PopupHostedStationCard
        hostStation={hostStation}
        isHostLoading={isHostLoading}
        anchor={badgeRef}
        onOpenHost={(stationId) => {
          setIsOpen(false);
          onOpenStation(stationId);
        }}
      />
    </Popover>
  );
}

type PopupStationTechnologiesProps = {
  cells: readonly Cell[] | null;
  loadFailed: boolean;
};

function PopupStationTechnologies({ cells, loadFailed }: PopupStationTechnologiesProps) {
  if (cells !== null) return <TechnologySummary bands={getCellTechnologyBands(cells)} className="pl-0" />;
  return loadFailed ? null : <TechnologySummarySkeleton />;
}

type PopupStationRowProps = {
  station: PopupStationEntry;
  hostStation: MapPointStation | null;
  isHostLoading: boolean;
  showAddToList: boolean;
  loadFailed: boolean;
  onOpenStationDetails: (id: number) => boolean | void;
};

function PopupStationRow({ station, hostStation, isHostLoading, showAddToList, loadFailed, onOpenStationDetails }: PopupStationRowProps) {
  const { t } = useTranslation("main");
  const hostedBadgeRef = useRef<HTMLElement>(null);
  const networksId = findStationIdentifier(station.identifiers, NETWORKS_ID_KIND);
  const isHosted = station.hostStationId !== null;

  return (
    <PopupRow
      brand={station.brand}
      color={station.color}
      onOpen={() => onOpenStationDetails(station.id)}
      title={
        <>
          <PopupOperatorName name={station.operatorName || t("unknownOperator")} />
          <PopupStationId id={station.siteId} />
          {networksId ? <span className="font-mono text-[11px] text-foreground/70">N!{networksId}</span> : null}
          {isHosted ? (
            <PopupHostedStationBadge
              badgeRef={hostedBadgeRef}
              hostStation={hostStation}
              isHostLoading={isHostLoading}
              onOpenStation={onOpenStationDetails}
            />
          ) : null}
          <PopupStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} />
        </>
      }
      actionCount={showAddToList ? 1 : 0}
      actions={
        isHosted || showAddToList ? (
          <>
            {isHosted ? (
              <PopupHostedStationButton
                badgeRef={hostedBadgeRef}
                hostStation={hostStation}
                isHostLoading={isHostLoading}
                onOpenStation={onOpenStationDetails}
              />
            ) : null}
            {showAddToList ? <PopupAddToListButton stationId={station.id} /> : null}
          </>
        ) : null
      }
    >
      {station.status === "awaitingCells" ? null : <PopupStationTechnologies cells={station.cells} loadFailed={loadFailed} />}
    </PopupRow>
  );
}

type PopupRegisterStationRowProps = {
  station: UkeStation;
  lookups: MapLookups | undefined;
  showAddToList: boolean;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
};

function PopupRegisterStationRow({ station, lookups, showAddToList, onOpenUkeStationDetails }: PopupRegisterStationRowProps) {
  const { t } = useTranslation(["main", "stationDetails"]);
  const operatorLook = getOperatorLook(lookups, station.operator?.id);

  return (
    <PopupRow
      brand={operatorLook.brand}
      color={operatorLook.color}
      onOpen={() => onOpenUkeStationDetails(station)}
      title={
        <>
          <PopupOperatorName name={station.operator?.name || t("unknownOperator")} />
          <PopupStationId id={station.station_id} />
          {isUkeStationExpired(station) ? <PopupExpiredLabel /> : null}
        </>
      }
      actionCount={showAddToList ? 1 : 0}
      actions={showAddToList ? <PopupAddToListButton ukeStationId={station.id} /> : null}
    >
      <TechnologySummary
        bands={getPermitBands(station.permits)}
        detail={t("stationDetails:permits.permitsCount", { count: station.permits.length })}
        className="pl-0"
      />
    </PopupRow>
  );
}

type PopupStationListProps = {
  isLoading: boolean;
  isEmpty: boolean;
  loadFailed: boolean;
  isUkeSource: boolean;
  ukeStations: readonly UkeStation[] | null;
  stations: readonly PopupStationEntry[] | null;
  locationStations: readonly MapPointStation[] | null;
  lookups: MapLookups | undefined;
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
  locationStations,
  lookups,
  showAddToList,
  onOpenStationDetails,
  onOpenUkeStationDetails,
}: PopupStationListProps) {
  const { t } = useTranslation("main");

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
      <PopupRegisterStationRow
        key={station.id}
        station={station}
        lookups={lookups}
        showAddToList={showAddToList}
        onOpenUkeStationDetails={onOpenUkeStationDetails}
      />
    ));
  }
  if (stations) {
    const hostCandidates: readonly MapPointStation[] = locationStations ?? stations;

    return stations.map((station) => (
      <PopupStationRow
        key={station.id}
        station={station}
        hostStation={findHostStation(station, hostCandidates)}
        isHostLoading={locationStations === null && !loadFailed}
        showAddToList={showAddToList}
        loadFailed={loadFailed}
        onOpenStationDetails={onOpenStationDetails}
      />
    ));
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

  const { data: photos = [] } = useQuery(locationPhotoRecordsQueryOptions(locationId));

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
  location: MapPlace;
  stations: readonly PopupStationEntry[] | null;
  locationStations: readonly MapPointStation[] | null;
  ukeStations: readonly UkeStation[] | null;
  lookups: MapLookups | undefined;
  source: StationSource;
  showAddToList?: boolean;
  loadFailed?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
  onClose: () => void;
  onOpenStationDetails: (id: number) => boolean | void;
  onOpenUkeStationDetails: (station: UkeStation) => boolean | void;
};

export function PopupContent({
  location,
  stations,
  locationStations,
  ukeStations,
  lookups,
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
  const structure = location.structure;
  const showStructure = !isUkeSource && structure !== undefined && (structure.type !== null || structure.owner !== null || Boolean(structure.note));

  return (
    <div className="w-72 text-sm">
      <PopupLocationHeader
        city={location.city}
        region={location.regionName}
        address={location.address}
        description={
          showStructure ? (
            <StationStructureLine
              location={{ address: location.address, structure }}
              ownerBrand={getStructureOwnerBrand(structure.owner, lookups?.brands, lookups?.operators)}
              showNote
            />
          ) : undefined
        }
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
          locationStations={locationStations}
          lookups={lookups}
          showAddToList={showAddToList}
          onOpenStationDetails={onOpenStationDetails}
          onOpenUkeStationDetails={onOpenUkeStationDetails}
        />
      </div>

      <PopupCoordinatesFooter latitude={location.latitude} longitude={location.longitude} />
    </div>
  );
}

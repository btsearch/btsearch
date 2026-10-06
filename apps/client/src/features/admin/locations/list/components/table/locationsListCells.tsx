import { Cancel01Icon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/cellular/brandMark";
import type { LocationsListRow, LocationsListRowStation } from "@/features/admin/locations/list/data/locationsListRows";
import { STATION_STATUS_TEXT_CLASSES } from "@/features/stations/components/StationStatusBadge";
import type { ListRowActionPlacement } from "@/features/stations/list/components/table/listRowActions";
import type { GpsFormat } from "@/hooks/usePreferences";
import { formatCoordinate } from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";
import type { StationStatus } from "@/types/station";

type LocationLinkProps = {
  row: LocationsListRow;
  className: string;
  label?: string;
  children: ReactNode;
};

type LocationCoordinatesProps = {
  latitude: number;
  longitude: number;
  gpsFormat: GpsFormat;
};

type StatusMark = {
  icon: IconSvgElement;
  className: string;
};

type ChipStep = {
  count: number;
  chipClassName?: string;
  restClassName?: string;
};

type StationChipProps = {
  station: LocationsListRowStation;
  className?: string;
};

type HiddenStationsChipProps = {
  stations: readonly LocationsListRowStation[];
  className?: string;
};

type LocationStationChipsProps = {
  stations: readonly LocationsListRowStation[];
  placement: ListRowActionPlacement;
};

const CHIP_MARK_SIZE = 14;
const TITLE_SEPARATOR = " - ";
const LABEL_SEPARATOR = " ";
const LIST_SEPARATOR = ", ";
const CHIP_STEPS: Record<ListRowActionPlacement, readonly ChipStep[]> = {
  row: [
    { count: 2, restClassName: "@min-[1600px]:hidden" },
    { count: 3, chipClassName: "hidden @min-[1600px]:inline-flex", restClassName: "hidden @min-[1600px]:@max-[1860px]:inline-flex" },
    { count: 4, chipClassName: "hidden @min-[1860px]:inline-flex", restClassName: "hidden @min-[1860px]:inline-flex" },
  ],
  card: [{ count: 3 }],
};
const COORDINATE_LINE_CLASS = "block truncate font-mono text-xs leading-4 tabular-nums";
const CHIP_CLASS = cn(
  "inline-flex h-5.5 items-center gap-1.5 rounded-sm bg-foreground/5 pr-1.75 pl-1.5",
  "font-mono text-xs leading-none font-medium whitespace-nowrap",
);
const STATUS_MARKS: Record<StationStatus, StatusMark> = {
  published: { icon: CheckmarkCircle02Icon, className: STATION_STATUS_TEXT_CLASSES.published },
  pending: { icon: Clock01Icon, className: STATION_STATUS_TEXT_CLASSES.pending },
  inactive: { icon: Cancel01Icon, className: STATION_STATUS_TEXT_CLASSES.inactive },
};

export const LOCATION_ID_CLASS = "font-mono text-[13px] leading-5 text-muted-foreground tabular-nums";

export function getLocationHref(row: LocationsListRow): string {
  return `/admin/locations/${row.id}`;
}

export function getLocationLabel(row: LocationsListRow): string {
  return [`#${row.id}`, row.city, row.address].filter((part) => part !== null).join(LABEL_SEPARATOR);
}

export function LocationLink({ row, className, label, children }: LocationLinkProps) {
  return (
    <Link to="/admin/locations/$id" params={{ id: String(row.id) }} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

export function LocationCoordinates({ latitude, longitude, gpsFormat }: LocationCoordinatesProps) {
  const latitudeText = formatCoordinate(latitude, "lat", gpsFormat);
  const longitudeText = formatCoordinate(longitude, "lng", gpsFormat);

  return (
    <>
      <span className={COORDINATE_LINE_CLASS} title={latitudeText}>
        {latitudeText}
      </span>
      <span className={COORDINATE_LINE_CLASS} title={longitudeText}>
        {longitudeText}
      </span>
    </>
  );
}

function getStationText(station: LocationsListRowStation): string {
  return station.operatorName === null ? station.siteId : `${station.siteId} (${station.operatorName})`;
}

function StationChip({ station, className }: StationChipProps) {
  const { t } = useTranslation("stations");
  const { badgeStatus } = station;
  const mark = badgeStatus === null ? null : STATUS_MARKS[badgeStatus];
  const statusName = badgeStatus === null ? null : t(`status.${badgeStatus}`);
  const title = [station.operatorName, statusName].filter((part) => part !== null).join(TITLE_SEPARATOR);

  return (
    <span title={title === "" ? undefined : title} className={cn(CHIP_CLASS, "min-w-0", className)}>
      <BrandMark brand={station.brand} size={CHIP_MARK_SIZE} />
      <span className="min-w-0 truncate leading-4">{station.siteId}</span>
      {mark === null ? null : (
        <>
          <HugeiconsIcon icon={mark.icon} className={cn("size-3 shrink-0", mark.className)} aria-hidden="true" />
          <span className="sr-only">{statusName}</span>
        </>
      )}
    </span>
  );
}

function HiddenStationsChip({ stations, className }: HiddenStationsChipProps) {
  const stationsText = stations.map(getStationText).join(LIST_SEPARATOR);

  return (
    <span title={stationsText} className={cn(CHIP_CLASS, "shrink-0", className)}>
      +{stations.length}
      <span className="sr-only">: {stationsText}</span>
    </span>
  );
}

export function LocationStationChips({ stations, placement }: LocationStationChipsProps) {
  const { t } = useTranslation("main");
  const steps = CHIP_STEPS[placement];
  const mostChips = Math.max(...steps.map((step) => step.count));

  if (stations.length === 0) return <span className="text-xs leading-4 text-muted-foreground">{t("popup.noStations")}</span>;

  return (
    <span className="flex min-w-0 gap-1 overflow-hidden">
      {stations.slice(0, mostChips).map((station, index) => (
        <StationChip key={station.id} station={station} className={steps.find((step) => index < step.count)?.chipClassName} />
      ))}
      {steps.map((step) =>
        stations.length > step.count ? (
          <HiddenStationsChip key={step.count} stations={stations.slice(step.count)} className={step.restClassName} />
        ) : null,
      )}
    </span>
  );
}

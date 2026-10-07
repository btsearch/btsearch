import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { type MouseEvent, memo } from "react";
import { useTranslation } from "react-i18next";

import type { StationPhotoGroup } from "../galleryTiles";
import { BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import type { MapOperator } from "@/features/map/data/mapLookups";
import { toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { hasModifierKey } from "@/lib/dom/keyboard";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type GalleryGroupHeaderProps = Pick<StationPhotoGroup, "station" | "location"> & {
  photoCount: number;
  operator: MapOperator | undefined;
  locationLabel: string;
  compact: boolean;
  hasCountryTile: boolean;
};

const LOCATION_LINK_CLASS = "underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none";

function GalleryGroupHeaderInner({ station, location, photoCount, operator, locationLabel, compact, hasCountryTile }: GalleryGroupHeaderProps) {
  const { t, i18n } = useTranslation("main");
  const { openStationDialog } = useFloatingDialogStack();
  const locationParams = { id: String(location.id) };
  const photoCountText = t("photos.stationPhotoCount", { count: photoCount });
  const countryName = getCountryName(location.countryCode, i18n.language);

  function openStationWindow(event: MouseEvent<HTMLAnchorElement>) {
    if (hasModifierKey(event)) return;
    event.preventDefault();
    openStationDialog(station.id, "internal");
  }

  return (
    <div className="mb-3 flex items-start gap-3 sm:items-center">
      <div className="min-w-0 text-left">
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden sm:gap-2">
          <a
            href={`/stations/${station.id}`}
            className="group flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden focus-visible:outline-none"
            onClick={openStationWindow}
          >
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              {operator === undefined ? null : (
                <span className="flex min-w-0 items-center gap-1.5">
                  <BrandMark brand={operator.brand} size={16} />
                  <span className="min-w-0 truncate text-xs font-medium text-foreground">{operator.operator.name}</span>
                </span>
              )}
              <span
                className={cn(
                  "shrink-0 font-mono text-sm font-medium text-foreground tabular-nums",
                  "underline-offset-2 group-hover:underline group-focus-visible:underline",
                  compact ? "max-sm:text-xs" : null,
                )}
              >
                {station.siteId}
              </span>
            </span>
            {station.status === "active" ? null : <StationStatusBadge status={toV1StationStatus(station.status)} />}
          </a>
          {hasCountryTile ? <CountryCodeTile code={location.countryCode} size="xs" label={countryName} className="max-sm:hidden" /> : null}
          <Link
            to="/locations/$id"
            params={locationParams}
            className={cn("hidden max-w-80 truncate text-xs text-muted-foreground sm:inline", LOCATION_LINK_CLASS)}
          >
            {locationLabel}
          </Link>
        </span>
        <span className="mt-1 flex min-w-0 items-center text-xs text-muted-foreground sm:hidden">
          <Link to="/locations/$id" params={locationParams} className={cn("flex min-w-0 items-center gap-1", LOCATION_LINK_CLASS)}>
            <HugeiconsIcon icon={Location01Icon} className="size-3.5 shrink-0" aria-hidden="true" />
            {hasCountryTile ? <CountryCodeTile code={location.countryCode} size="xs" label={countryName} /> : null}
            <span className="truncate">{locationLabel}</span>
          </Link>
          {compact ? (
            <>
              <span className="mx-1" aria-hidden="true">
                ·
              </span>
              <span className="shrink-0">{photoCountText}</span>
            </>
          ) : null}
        </span>
      </div>
      <div className="mt-2 hidden h-px min-w-6 flex-1 bg-border sm:block" />
      <span className={cn("ml-auto shrink-0 pt-0.5 text-xs text-muted-foreground sm:pt-0", compact ? "max-sm:hidden" : null)}>{photoCountText}</span>
    </div>
  );
}

export const GalleryGroupHeader = memo(GalleryGroupHeaderInner);

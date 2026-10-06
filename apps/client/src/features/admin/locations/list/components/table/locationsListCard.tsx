import { useTranslation } from "react-i18next";

import { LocationLink, LocationStationChips, getLocationLabel } from "./locationsListCells";
import { LOCATIONS_CARD_HEIGHT_CLASS } from "./locationsListLayout";
import { LocationRowActions } from "./locationsListRowActions";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import type { LocationsListRow } from "@/features/admin/locations/list/data/locationsListRows";
import { ListCardDate, ListCountryTile, ListStructureLine } from "@/features/stations/list/components/table/listCells";
import {
  LIST_CARD_BODY_CLASS,
  LIST_CARD_CLASS,
  LIST_CARD_DETAIL_LINE_CLASS,
  LIST_CARD_LINK_CLASS,
  LIST_SKELETON_CARD_CLASS,
} from "@/features/stations/list/components/table/listTableRow";
import type { GpsFormat } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";

type LocationsListCardProps = {
  row: LocationsListRow;
  gpsFormat: GpsFormat;
  hasCountryTiles: boolean;
};

export function LocationsListCard({ row, gpsFormat, hasCountryTiles }: LocationsListCardProps) {
  const { t } = useTranslation("common");

  return (
    <li className={cn(LIST_CARD_CLASS, LOCATIONS_CARD_HEIGHT_CLASS)}>
      <LocationLink row={row} className={LIST_CARD_LINK_CLASS}>
        <span className="sr-only">{getLocationLabel(row)}</span>
      </LocationLink>
      <div className={LIST_CARD_BODY_CLASS}>
        <div className="flex min-w-0 items-center gap-1.5">
          {hasCountryTiles ? <ListCountryTile countryCode={row.countryCode} /> : null}
          <span className="truncate text-sm leading-5 font-medium group-hover/card:underline">{row.city ?? <EmptyValue />}</span>
          <ListCardDate updatedAt={row.updatedAt} />
        </div>
        <div className={LIST_CARD_DETAIL_LINE_CLASS}>
          <span className="min-w-0 flex-1 truncate">{row.address}</span>
          <span className="max-w-[50%] flex-none truncate">{row.regionName}</span>
        </div>
        <div className={cn(LIST_CARD_DETAIL_LINE_CLASS, "mt-0.5")}>
          <ListStructureLine structure={row.structure} />
          <span className="shrink-0 font-mono tabular-nums">#{row.id}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-4 text-muted-foreground tabular-nums">
            <span className="sr-only">{t("labels.coordinates")}: </span>
            {formatCoordinates(row.latitude, row.longitude, gpsFormat)}
          </span>
          <LocationRowActions row={row} placement="card" />
        </div>
        <div className="mt-1 flex min-h-5.5 min-w-0 items-center">
          <LocationStationChips stations={row.stations} placement="card" />
        </div>
      </div>
    </li>
  );
}

export function LocationsListSkeletonCard() {
  return (
    <div className={cn(LIST_SKELETON_CARD_CLASS, LOCATIONS_CARD_HEIGHT_CLASS)}>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-5.5 w-44 rounded-sm" />
    </div>
  );
}

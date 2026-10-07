import { useTranslation } from "react-i18next";

import { LOCATION_ID_CLASS, LocationCoordinates, LocationLink, LocationStationChips, getLocationHref, getLocationLabel } from "./locationsListCells";
import { LOCATIONS_GRID_CLASSES } from "./locationsListLayout";
import { LocationRowActions } from "./locationsListRowActions";
import { Skeleton } from "@/components/ui/skeleton";
import type { LocationsListSortColumn, LocationsListSortState } from "@/features/admin/locations/list/data/locationsListFilters";
import type { LocationsListRow as LocationsListRowModel } from "@/features/admin/locations/list/data/locationsListRows";
import { ListCell, ListDatesCell, ListPlaceCell, ListStructureCell } from "@/features/stations/list/components/table/listCells";
import { ListDatesHead, ListSortHead } from "@/features/stations/list/components/table/listSortButton";
import { LIST_HEAD_ROW_CLASS, LIST_ROW_CLASS, LIST_ROW_LINK_CLASS, ListTableRow } from "@/features/stations/list/components/table/listTableRow";
import type { GpsFormat } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type LocationsListHeadProps = {
  gpsFormat: GpsFormat;
  sort: LocationsListSortState;
  onSortPick: (column: LocationsListSortColumn) => void;
};

type LocationsListRowProps = {
  row: LocationsListRowModel;
  gpsFormat: GpsFormat;
  hasCountryTiles: boolean;
  onOpen: (row: LocationsListRowModel) => void;
};

export function LocationsListHead({ gpsFormat, sort, onSortPick }: LocationsListHeadProps) {
  const { t } = useTranslation("common");

  return (
    <div role="row" className={cn(LOCATIONS_GRID_CLASSES[gpsFormat], LIST_HEAD_ROW_CLASS)}>
      <ListSortHead column="id" label={t("labels.id")} activeColumn={sort.column} isDescending={sort.isDescending} onSortPick={onSortPick} />
      <div role="columnheader">{t("labels.location")}</div>
      <div role="columnheader">{t("structure.type")}</div>
      <div role="columnheader">{t("labels.coordinates")}</div>
      <div role="columnheader">{t("labels.stations")}</div>
      <ListDatesHead activeColumn={sort.column} isDescending={sort.isDescending} onSortPick={onSortPick} />
    </div>
  );
}

export function LocationsListRow({ row, gpsFormat, hasCountryTiles, onOpen }: LocationsListRowProps) {
  return (
    <ListTableRow href={getLocationHref(row)} className={LOCATIONS_GRID_CLASSES[gpsFormat]} onOpen={() => onOpen(row)}>
      <ListCell>
        <LocationLink row={row} className={cn(LOCATION_ID_CLASS, LIST_ROW_LINK_CLASS)} label={getLocationLabel(row)}>
          {row.id}
        </LocationLink>
      </ListCell>
      <ListCell>
        <ListPlaceCell countryCode={hasCountryTiles ? row.countryCode : null} city={row.city} address={row.address} regionName={row.regionName} />
      </ListCell>
      <ListCell>
        <ListStructureCell structure={row.structure} />
      </ListCell>
      <ListCell>
        <LocationCoordinates latitude={row.latitude} longitude={row.longitude} gpsFormat={gpsFormat} />
      </ListCell>
      <ListCell>
        <LocationStationChips stations={row.stations} placement="row" />
      </ListCell>
      <ListCell>
        <ListDatesCell updatedAt={row.updatedAt} createdAt={row.createdAt} />
      </ListCell>
      <LocationRowActions row={row} placement="row" />
    </ListTableRow>
  );
}

export function LocationsListSkeletonRow({ gpsFormat }: { gpsFormat: GpsFormat }) {
  return (
    <div className={cn(LOCATIONS_GRID_CLASSES[gpsFormat], LIST_ROW_CLASS)}>
      <Skeleton className="h-3.5 w-9" />
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-2.5 w-11/12" />
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="size-4.5 shrink-0" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2.5 w-14" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-2.5 w-14" />
        <Skeleton className="h-2.5 w-14" />
      </div>
      <Skeleton className="h-5.5 w-36 rounded-sm" />
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-19" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  );
}

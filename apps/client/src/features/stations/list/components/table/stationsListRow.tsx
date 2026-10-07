import { useTranslation } from "react-i18next";

import { LIST_CUT_FIRST_CLASS, ListCell, ListDatesCell, ListPlaceCell, ListStructureCell } from "./listCells";
import { ListDatesHead, ListSortHead } from "./listSortButton";
import { LIST_HEAD_ROW_CLASS, LIST_ROW_CLASS, ListTableRow } from "./listTableRow";
import {
  STATION_ENBID_LABEL,
  StationCoordinates,
  StationIdentity,
  StationMatchLine,
  StationNodeIds,
  getStationBandsText,
  getStationHref,
} from "./stationsListCells";
import { STATIONS_GRID_CLASSES, STATIONS_PLACE_LINE_CLASS, STATIONS_WIDE_ONLY_CLASS } from "./stationsListLayout";
import { StationRowActions, type StationRowOpeners } from "./stationsListRowActions";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import type { StationsListSortColumn, StationsListSortState, StationsListVariant } from "@/features/stations/list/data/stationsListFilters";
import type { StationsListRow as StationsListRowModel } from "@/features/stations/list/data/stationsListRows";
import type { GpsFormat } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type StationsListHeadProps = {
  variant: StationsListVariant;
  sort: StationsListSortState;
  onSortPick: (column: StationsListSortColumn) => void;
};

type StationsListRowProps = {
  row: StationsListRowModel;
  variant: StationsListVariant;
  hasCountryTiles: boolean;
  gpsFormat: GpsFormat;
  openers: StationRowOpeners;
};

const BANDS_CLAMP_CLASS = "line-clamp-2 max-h-8";

export function StationsListHead({ variant, sort, onSortPick }: StationsListHeadProps) {
  const { t } = useTranslation("common");

  return (
    <div role="row" className={cn(STATIONS_GRID_CLASSES[variant], LIST_HEAD_ROW_CLASS)}>
      <ListSortHead
        column="siteId"
        label={t("labels.stationId")}
        activeColumn={sort.column}
        isDescending={sort.isDescending}
        onSortPick={onSortPick}
      />
      <div role="columnheader">{t("labels.location")}</div>
      <div role="columnheader">
        <span className="sr-only @min-[870px]:not-sr-only">{t("structure.type")}</span>
      </div>
      <div role="columnheader">
        {t("labels.standard")} / {t("labels.band")}
      </div>
      <div role="columnheader" className={STATIONS_WIDE_ONLY_CLASS}>
        {STATION_ENBID_LABEL}
      </div>
      <ListDatesHead activeColumn={sort.column} isDescending={sort.isDescending} onSortPick={onSortPick} />
    </div>
  );
}

export function StationsListRow({ row, variant, hasCountryTiles, gpsFormat, openers }: StationsListRowProps) {
  const { i18n } = useTranslation();
  const match =
    row.matchLine === null ? undefined : (
      <StationMatchLine matchLine={row.matchLine} operatorName={row.operatorName} className={cn("ml-auto", LIST_CUT_FIRST_CLASS)} />
    );
  const coordinates =
    row.latitude === null || row.longitude === null ? undefined : (
      <StationCoordinates
        latitude={row.latitude}
        longitude={row.longitude}
        gpsFormat={gpsFormat}
        hasAddress={row.address !== null}
        className={STATIONS_WIDE_ONLY_CLASS}
      />
    );

  return (
    <ListTableRow href={getStationHref(row, variant)} className={STATIONS_GRID_CLASSES[variant]} onOpen={() => openers.openRow(row)}>
      <ListCell>
        <StationIdentity row={row} variant={variant} onWindowOpen={openers.openWindow} />
      </ListCell>
      <ListCell>
        <ListPlaceCell
          countryCode={hasCountryTiles ? row.countryCode : null}
          city={row.city}
          cityMark={row.cityMark}
          address={row.address}
          addressMark={row.addressMark}
          regionName={row.regionName}
          cityAside={match}
          addressAside={coordinates}
          lineClassName={STATIONS_PLACE_LINE_CLASS}
        />
      </ListCell>
      <ListCell>
        <ListStructureCell structure={row.structure} isFolding />
      </ListCell>
      <ListCell className="text-[11px] leading-4">
        {row.bands.length > 0 ? (
          <div className={BANDS_CLAMP_CLASS} title={getStationBandsText(row.bands, i18n.language)}>
            <TechnologySummary bands={row.bands} className="mt-0 pl-0" />
          </div>
        ) : (
          <EmptyValue />
        )}
      </ListCell>
      <ListCell className={STATIONS_WIDE_ONLY_CLASS}>
        <StationNodeIds enbIds={row.enbIds} gnbIds={row.gnbIds} />
      </ListCell>
      <ListCell>
        <ListDatesCell updatedAt={row.updatedAt} createdAt={row.createdAt} />
      </ListCell>
      {variant === "admin" ? <StationRowActions row={row} placement="row" onWindowOpen={openers.openWindow} /> : null}
    </ListTableRow>
  );
}

export function StationsListSkeletonRow({ variant }: { variant: StationsListVariant }) {
  return (
    <div className={cn(STATIONS_GRID_CLASSES[variant], LIST_ROW_CLASS)}>
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-21" />
        <Skeleton className="ml-5.5 h-2.5 w-14" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-2.5 w-11/12" />
      </div>
      <Skeleton className="size-4.5" />
      <div className="space-y-1.5">
        <Skeleton className="h-2.5 w-48" />
        <Skeleton className="h-2.5 w-18" />
      </div>
      <Skeleton className={cn("h-3.5 w-14", STATIONS_WIDE_ONLY_CLASS)} />
      <div className="space-y-1.5">
        <Skeleton className="h-3.5 w-19" />
        <Skeleton className="h-2.5 w-16" />
      </div>
    </div>
  );
}

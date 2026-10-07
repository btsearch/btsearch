import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Brand, Operator, StationStatus } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/cellular/brandMark";
import { buttonVariants } from "@/components/ui/button";
import { EDITOR_STATION_SEARCH } from "@/features/admin/stations/editorStationSearch";
import { locationRecordQueryOptions } from "@/features/station-details/station/api";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { cn } from "@/lib/utils";

export type PlaceStation = {
  id: number;
  siteId: string;
  operatorId: number | null;
  status: StationStatus;
};

type PlaceStationsProps = {
  stations: readonly PlaceStation[];
  operatorsById: ReadonlyMap<number, Operator>;
  brands: readonly Brand[];
  opensEditor: boolean;
};

type PlaceStationChipProps = {
  station: PlaceStation;
  operator: Operator | null;
  brand: Brand | null;
  opensEditor: boolean;
};

const NO_STATIONS: PlaceStation[] = [];
const CHIP_CLASS = cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5 px-2 text-xs font-normal");

export function useOwnPlaceStations(locationId: number | null, stationId: number | null): readonly PlaceStation[] | null {
  const { data: location } = useQuery(locationRecordQueryOptions(locationId));

  if (locationId === null) return NO_STATIONS;
  if (location === undefined) return null;
  return location.stations.filter((station) => station.id !== stationId);
}

function PlaceStationChip({ station, operator, brand, opensEditor }: PlaceStationChipProps) {
  const { t } = useTranslation();
  const content = (
    <>
      <BrandMark brand={brand} size={14} />
      <span className="font-medium">{operator?.name ?? t("main:unknownOperator")}</span>
      <span className="font-mono font-semibold">{station.siteId}</span>
      {station.status === "active" ? null : <StationStatusBadge status={toV1StationStatus(station.status)} className="pointer-events-none" />}
      <HugeiconsIcon icon={ArrowUpRight01Icon} aria-hidden="true" className="size-3 text-muted-foreground" />
    </>
  );

  if (!opensEditor) {
    return (
      <Link to="/stations/$id" params={{ id: String(station.id) }} className={CHIP_CLASS}>
        {content}
      </Link>
    );
  }

  return (
    <Link to="/admin/stations/$id" params={{ id: String(station.id) }} search={EDITOR_STATION_SEARCH} className={CHIP_CLASS}>
      {content}
    </Link>
  );
}

export function PlaceStations({ stations, operatorsById, brands, opensEditor }: PlaceStationsProps) {
  const { t } = useTranslation();

  if (stations.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
      <p className="text-xs text-muted-foreground">{t("stations:edit.location.stationsHere")}</p>
      <div className="flex flex-wrap gap-x-2 gap-y-1.5">
        {stations.map((station) => {
          const operator = station.operatorId === null ? null : (operatorsById.get(station.operatorId) ?? null);

          return (
            <PlaceStationChip
              key={station.id}
              station={station}
              operator={operator}
              brand={getOperatorBrand(operator, brands)}
              opensEditor={opensEditor}
            />
          );
        })}
      </div>
    </div>
  );
}

import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { StationDialogHeading } from "../../../components/stationDialogShell";
import type { Brand, LocationStationRecord, Operator, StationRecord } from "../../types";
import { getOperatorBrand } from "../../utils/brands";
import { findHostStation, toV1StationStatus } from "../../utils/stations";
import { getStructureOwnerBrand } from "../../utils/structure";
import { HostedStationBadge } from "./hostedStationBadge";
import { StationStructureLine } from "./stationStructureLine";
import { BrandMark } from "@/components/cellular/brandMark";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";

type StationPanelHeadingProps = {
  station: StationRecord;
  brands?: Brand[];
  operators?: Operator[];
  locationStations?: LocationStationRecord[];
  isLocationLoading: boolean;
  onOpenStation: (stationId: number) => void;
};

export function StationPanelHeading({ station, brands, operators, locationStations, isLocationLoading, onOpenStation }: StationPanelHeadingProps) {
  const { t } = useTranslation(["stationDetails", "common", "main"]);
  const hostStation = findHostStation(station, locationStations);

  return (
    <StationDialogHeading
      operatorName={station.operator?.name ?? t("main:unknownOperator")}
      operatorMark={<BrandMark brand={getOperatorBrand(station.operator, brands)} size={20} />}
      stationCode={station.siteId}
      badges={
        <>
          {station.hostStationId !== null ? (
            <HostedStationBadge
              hostStation={hostStation}
              hostBrand={getOperatorBrand(hostStation?.operator, brands)}
              isHostLoading={isLocationLoading}
              onOpenStation={onOpenStation}
            />
          ) : null}
          {station.isConfirmed ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("common:labels.confirmed")}</span>
            </span>
          ) : null}
        </>
      }
      location={{ city: station.location?.city || t("common:labels.unknownLocation"), address: station.location?.address ?? null }}
      addressLine={
        <StationStructureLine
          location={station.location}
          ownerBrand={getStructureOwnerBrand(station.location?.structure.owner ?? null, brands, operators)}
        />
      }
      status={<StationStatusBadge status={toV1StationStatus(station.status)} statusChangedAt={station.statusChangedAt} />}
      createdAt={station.createdAt}
      updatedAt={station.updatedAt}
    />
  );
}

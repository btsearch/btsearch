import { memo } from "react";
import { useTranslation } from "react-i18next";

import { PopupExpiredLabel, PopupLocationHeader, PopupOperatorName, PopupRow, PopupStationId } from "./popupParts";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import type { StationStatus } from "@/types/station";

export type StationHoverEntry = {
  key: number;
  stationId: string;
  operatorName?: string;
  mnc?: number | null;
  status?: StationStatus;
  isExpired?: boolean;
};

type StationHoverTooltipContentProps = {
  city?: string;
  address?: string;
  region?: string;
  stations: StationHoverEntry[];
};

const MAX_VISIBLE = 5;

export const StationHoverTooltipContent = memo(function StationHoverTooltipContent({
  city,
  address,
  region,
  stations,
}: StationHoverTooltipContentProps) {
  const { t } = useTranslation("main");
  const remaining = stations.length - MAX_VISIBLE;

  return (
    <div className="w-72 text-sm">
      <PopupLocationHeader city={city} region={region} address={address} />
      {stations.slice(0, MAX_VISIBLE).map((station) => (
        <PopupRow
          key={station.key}
          mnc={station.mnc}
          className="py-1.5"
          title={
            <>
              <PopupOperatorName name={station.operatorName || t("unknownOperator")} />
              <PopupStationId id={station.stationId} />
              {station.status !== undefined && station.status !== "published" ? <StationStatusBadge status={station.status} /> : null}
              {station.isExpired ? <PopupExpiredLabel /> : null}
            </>
          }
        />
      ))}
      {remaining > 0 ? <div className="px-3 py-1.5 text-[10px] text-muted-foreground">{t("popup.moreStations", { count: remaining })}</div> : null}
    </div>
  );
});

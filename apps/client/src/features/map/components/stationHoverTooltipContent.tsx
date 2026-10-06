import { useTranslation } from "react-i18next";

import { type MapPoint, isMapPointStationExpired } from "../data/mapPoints";
import { PopupExpiredLabel, PopupLocationHeader, PopupOperatorName, PopupRow, PopupStationId, PopupStatusBadge } from "./popupParts";

type StationHoverTooltipContentProps = {
  point: MapPoint;
};

const MAX_VISIBLE = 5;

export function StationHoverTooltipContent({ point }: StationHoverTooltipContentProps) {
  const { t } = useTranslation("main");
  const remaining = point.stations.length - MAX_VISIBLE;

  return (
    <div className="w-72 text-sm">
      <PopupLocationHeader city={point.city} region={point.regionName} address={point.address} />
      {point.stations.slice(0, MAX_VISIBLE).map((station) => (
        <PopupRow
          key={station.id}
          brand={station.brand}
          color={station.color}
          className="py-1.5"
          title={
            <>
              <PopupOperatorName name={station.operatorName || t("unknownOperator")} />
              <PopupStationId id={station.siteId} />
              <PopupStatusBadge status={station.status} />
              {isMapPointStationExpired(station) ? <PopupExpiredLabel /> : null}
            </>
          }
        />
      ))}
      {remaining > 0 ? <div className="px-3 py-1.5 text-[10px] text-muted-foreground">{t("popup.moreStations", { count: remaining })}</div> : null}
    </div>
  );
}

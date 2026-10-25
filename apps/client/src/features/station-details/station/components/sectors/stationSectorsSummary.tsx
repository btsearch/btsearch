import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { listMeasuredDirections, listSectorBearings } from "../../measurements/measuredCells";
import { useStationMeasurements } from "../../measurements/useStationMeasurements";
import type { StationRecord } from "../../types";
import { formatSectorAzimuth, listSectorInfo } from "../../utils/sectors";
import { MeasuredBearingLegend } from "./measuredBearingLegend";
import { AzimuthCompass } from "@/components/cellular/azimuthCompass";

type StationSectorsSummaryProps = {
  station: StationRecord;
  color: string;
};

export function StationSectorsSummary({ station, color }: StationSectorsSummaryProps) {
  const { t } = useTranslation("stationDetails");
  const measurements = useStationMeasurements(station);
  const bearings = listSectorBearings(station.sectors, station.cells, measurements.cellsById);
  const sectors = listSectorInfo(station.sectors);
  const measuredSectors = sectors.flatMap((sector) => {
    const bearing = bearings.get(sector.id);
    return bearing === undefined ? [] : [{ sector, bearing }];
  });
  const differingLabels = measuredSectors.filter(({ bearing }) => bearing.differs).map(({ sector }) => sector.label);

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <AzimuthCompass
        directions={station.sectors.map((sector) => ({ azimuth: sector.azimuth, name: formatSectorAzimuth(sector.azimuth, t) }))}
        measuredDirections={listMeasuredDirections(bearings)}
        color={color}
        className="size-56 sm:size-60"
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {sectors.map((sector) => (
          <span key={sector.id} className="text-xs font-medium text-muted-foreground tabular-nums">
            {sector.label}: {formatSectorAzimuth(sector.azimuth, t)}
          </span>
        ))}
      </div>
      {measuredSectors.length > 0 ? (
        <>
          <MeasuredBearingLegend color={color} />
          <p className="text-center text-xs text-muted-foreground">
            {t("sectors.measuredList", {
              bearings: measuredSectors.map(({ sector, bearing }) => `${sector.label} ${bearing.bearingDegrees}°`).join(", "),
            })}
          </p>
        </>
      ) : null}
      {differingLabels.length > 0 ? (
        <p className="flex items-start justify-center gap-1 text-xs text-muted-foreground">
          <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {t("sectors.measuredDiffers", { sectors: differingLabels.join(", ") })}
        </p>
      ) : null}
    </div>
  );
}

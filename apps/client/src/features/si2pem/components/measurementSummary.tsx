import Location01Icon from "@hugeicons/core-free-icons/Location01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import { StationTitle } from "@/features/station-details/components/stationTitle";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { PlannedStatus } from "../api";

export type MeasurementSummaryData = {
  station_id: string | null;
  operator: { name: string; mnc?: number | null } | null;
  region: { name: string } | null;
  location: { city: string; address: string };
  status: PlannedStatus;
  disabled_date?: string | null;
  date: { from: string | null; to: string | null } | null;
  lab: { name: string } | null;
};

export function getMeasurementDate(measurement: MeasurementSummaryData, locale: string) {
  if (measurement.status === "INACTIVE") return measurement.disabled_date ? formatShortDate(measurement.disabled_date, locale) : "-";

  const from = measurement.date?.from ? formatShortDate(measurement.date.from, locale) : "-";
  const to = measurement.date?.to ? formatShortDate(measurement.date.to, locale) : "-";
  return from === to ? from : `${from}-${to}`;
}

type MeasurementSummaryProps = {
  measurement: MeasurementSummaryData;
  locale: string;
  unknownCityLabel: string;
  noAddressLabel: string;
  action?: ReactNode;
  stackLab?: boolean;
  labDetail?: string | null;
  stationIdClassName?: string;
  className?: string;
};

export function MeasurementSummary({
  measurement,
  locale,
  unknownCityLabel,
  noAddressLabel,
  action,
  stackLab = false,
  labDetail,
  stationIdClassName,
  className,
}: MeasurementSummaryProps) {
  const city = measurement.location.city || unknownCityLabel;
  const regionName = measurement.region?.name;
  const address = measurement.location.address;
  const labName = measurement.lab?.name;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StationTitle
            stationId={measurement.station_id ?? "-"}
            operator={measurement.operator ?? undefined}
            stationIdClassName={stationIdClassName}
          />
        </div>
        {action}
      </div>

      <div className="mt-2 flex min-w-0 items-start gap-2">
        <HugeiconsIcon icon={Location01Icon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate text-sm leading-tight">
            <span className="font-medium text-foreground">{city}</span>
            {regionName ? <span className="text-xs text-muted-foreground"> · {regionName}</span> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground underline-offset-2 group-hover:underline group-focus-visible:underline">
            {address || noAddressLabel}
          </div>
        </div>
      </div>

      <div className={cn("mt-2 min-w-0 text-xs text-muted-foreground", stackLab ? "space-y-0.5" : "flex items-center justify-between gap-3")}>
        <div className={cn("tabular-nums", stackLab ? null : "shrink-0")}>{getMeasurementDate(measurement, locale)}</div>
        {labName || labDetail ? (
          <div className="flex min-w-0">
            {labName ? <span className="truncate">{labName}</span> : null}
            {labDetail ? <span className={cn("shrink-0", labName ? "ml-1" : null)}>({labDetail})</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

import type { PlannedStatus } from "../api";
import { StationTitle } from "@/features/station-details/components/stationTitle";
import { formatShortDate } from "@/lib/format";

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

export function getMeasurementDate(measurement: Pick<MeasurementSummaryData, "status" | "disabled_date" | "date">, locale: string) {
  if (measurement.status === "INACTIVE") return measurement.disabled_date ? formatShortDate(measurement.disabled_date, locale) : "-";

  const from = measurement.date?.from ? formatShortDate(measurement.date.from, locale) : "-";
  const to = measurement.date?.to ? formatShortDate(measurement.date.to, locale) : "-";
  return from === to ? from : `${from}-${to}`;
}

type PEMStationTitleProps = {
  stationId: string | null;
  operator: { name: string; mnc?: number | null } | null;
};

export function PEMStationTitle({ stationId, operator }: PEMStationTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <StationTitle stationId={stationId ?? "-"} operator={operator ?? undefined} stationIdClassName="underline-offset-2 group-hover:underline" />
    </div>
  );
}

type PEMRecordSummaryProps = PEMStationTitleProps & {
  city: string;
  regionName?: string | null;
  address: string;
  noAddressLabel: string;
  action?: ReactNode;
  footer: ReactNode;
};

export function PEMRecordSummary({ stationId, operator, city, regionName, address, noAddressLabel, action, footer }: PEMRecordSummaryProps) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <PEMStationTitle stationId={stationId} operator={operator} />
        {action}
      </div>

      <div className="mt-2 flex min-w-0 items-start gap-2">
        <HugeiconsIcon icon={Location01Icon} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate text-sm leading-tight">
            <span className="font-medium text-foreground">{city}</span>
            {regionName ? <span className="text-xs text-muted-foreground"> · {regionName}</span> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground underline-offset-2 group-hover:underline">{address || noAddressLabel}</div>
        </div>
      </div>

      {footer}
    </div>
  );
}

type MeasurementSummaryProps = {
  measurement: MeasurementSummaryData;
  locale: string;
  unknownCityLabel: string;
  noAddressLabel: string;
  action?: ReactNode;
  footerAction?: ReactNode;
};

export function MeasurementSummary({ measurement, locale, unknownCityLabel, noAddressLabel, action, footerAction }: MeasurementSummaryProps) {
  const labName = measurement.lab?.name;
  const lab = labName ? (
    <div className="flex min-w-0">
      <span className="truncate">{labName}</span>
    </div>
  ) : null;

  return (
    <PEMRecordSummary
      stationId={measurement.station_id}
      operator={measurement.operator}
      city={measurement.location.city || unknownCityLabel}
      regionName={measurement.region?.name}
      address={measurement.location.address}
      noAddressLabel={noAddressLabel}
      action={action}
      footer={
        <div className="mt-2 min-w-0 text-xs text-muted-foreground flex items-center justify-between gap-3">
          <div className="tabular-nums shrink-0">{getMeasurementDate(measurement, locale)}</div>
          {footerAction ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {lab}
              <div className="-my-1 flex shrink-0 items-center">{footerAction}</div>
            </div>
          ) : (
            lab
          )}
        </div>
      }
    />
  );
}

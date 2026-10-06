import { Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { EmfMeasurement } from "@openbts/shared/contract";
import type { ReactNode } from "react";

import { type MeasurementTabRow, isInactiveSite } from "../api";
import { StationTitle } from "@/features/station-details/components/stationTitle";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { formatShortUtcDate } from "@/lib/format";

export function getMeasurementDate(measurement: MeasurementTabRow, locale: string) {
  if (isInactiveSite(measurement)) return formatShortUtcDate(measurement.disabledOn, locale);
  if (measurement.startsOn === null || measurement.endsOn === null) return "-";

  const from = formatShortUtcDate(measurement.startsOn, locale);
  const to = formatShortUtcDate(measurement.endsOn, locale);
  return from === to ? from : `${from}-${to}`;
}

export function getLaboratoryName(measurement: MeasurementTabRow) {
  return isInactiveSite(measurement) ? null : (measurement.laboratory?.name ?? null);
}

type PEMStationTitleProps = {
  siteId: string | null;
  operator: EmfMeasurement["operator"];
};

export function PEMStationTitle({ siteId, operator }: PEMStationTitleProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <StationTitle
        stationId={siteId ?? "-"}
        operator={operator ? { name: operator.name, mnc: toV1OperatorMnc(operator) } : undefined}
        stationIdClassName="underline-offset-2 group-hover:underline"
      />
    </div>
  );
}

type PEMRecordSummaryProps = PEMStationTitleProps & {
  city: string;
  regionName?: string | null;
  address: string | null;
  noAddressLabel: string;
  action?: ReactNode;
  footer: ReactNode;
};

export function PEMRecordSummary({ siteId, operator, city, regionName, address, noAddressLabel, action, footer }: PEMRecordSummaryProps) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <PEMStationTitle siteId={siteId} operator={operator} />
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
  measurement: MeasurementTabRow;
  locale: string;
  unknownCityLabel: string;
  noAddressLabel: string;
  action?: ReactNode;
  footerAction?: ReactNode;
};

export function MeasurementSummary({ measurement, locale, unknownCityLabel, noAddressLabel, action, footerAction }: MeasurementSummaryProps) {
  const labName = getLaboratoryName(measurement);
  const lab = labName ? (
    <div className="flex min-w-0">
      <span className="truncate">{labName}</span>
    </div>
  ) : null;

  return (
    <PEMRecordSummary
      siteId={measurement.siteId}
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

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getOperatorLook, useMapLookups } from "../data/mapLookups";
import { PopupCoordinatesFooter, PopupLocationHeader, PopupOperatorName, PopupRow, PopupStationId } from "./popupParts";
import { CloseButton } from "@/components/ui/close-button";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortUtcDate } from "@/lib/format";

type PemPopupProps = {
  siteId: string | null;
  operatorId: number | null;
  startsOn: string | null;
  endsOn: string | null;
  laboratoryName: string | null;
  accreditationNumber: string | null;
  city: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  onClose: () => void;
  onOpenStation?: () => void;
};

const MISSING_VALUE = "-";

function formatMeasurementPeriod(startsOn: string | null, endsOn: string | null, locale: string): string {
  const firstDay = formatShortUtcDate(startsOn, locale);
  const lastDay = formatShortUtcDate(endsOn, locale);
  return firstDay === lastDay ? firstDay : `${firstDay}-${lastDay}`;
}

export function PemPopupContent({
  siteId,
  operatorId,
  startsOn,
  endsOn,
  laboratoryName,
  accreditationNumber,
  city,
  address,
  latitude,
  longitude,
  onClose,
  onOpenStation,
}: PemPopupProps) {
  const { t, i18n } = useTranslation(["pem", "main"]);
  const { lookups, isError: hasLookupFailed, isRetrying: isRetryingLookups, retry: retryLookups } = useMapLookups();
  const operatorLook = getOperatorLook(lookups, operatorId);
  const period = formatMeasurementPeriod(startsOn, endsOn, i18n.resolvedLanguage ?? i18n.language);
  const isOperatorMissing = lookups === undefined && operatorId !== null;
  const hasOperatorFailed = isOperatorMissing && hasLookupFailed;

  let operatorName: ReactNode = <PopupOperatorName name={operatorLook.operator?.name || t("main:unknownOperator")} />;
  if (isOperatorMissing) operatorName = hasOperatorFailed ? null : <Skeleton className="h-3 w-14" />;

  return (
    <div className="w-72 text-sm">
      <PopupLocationHeader city={city} address={address} actions={<CloseButton size="xs" onClick={onClose} />} />
      {hasOperatorFailed ? <InlineError size="sm" onRetry={retryLookups} isRetrying={isRetryingLookups} className="m-1" /> : null}
      <PopupRow
        brand={operatorLook.brand}
        color={operatorLook.color}
        onOpen={onOpenStation}
        title={
          <>
            {operatorName}
            <PopupStationId id={siteId ?? MISSING_VALUE} />
          </>
        }
      >
        <span className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px] leading-4">
          <span className="text-muted-foreground">{t("pem:table.measurementDate")}</span>
          <span className="text-foreground/80 tabular-nums">{period}</span>
          {laboratoryName !== null || accreditationNumber !== null ? (
            <>
              <span className="text-muted-foreground">{t("pem:table.lab")}</span>
              <span className="text-foreground/80">
                {laboratoryName}
                {laboratoryName !== null && accreditationNumber !== null ? " " : null}
                {accreditationNumber !== null ? <span className="text-muted-foreground">({accreditationNumber})</span> : null}
              </span>
            </>
          ) : null}
        </span>
      </PopupRow>
      <PopupCoordinatesFooter latitude={latitude} longitude={longitude} />
    </div>
  );
}

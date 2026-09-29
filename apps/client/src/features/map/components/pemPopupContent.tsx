import { useTranslation } from "react-i18next";

import { PopupCoordinatesFooter, PopupLocationHeader, PopupOperatorName, PopupRow, PopupStationId } from "./popupParts";
import { CloseButton } from "@/components/ui/close-button";
import type { PlannedStatus } from "@/features/si2pem/api";
import { getMeasurementDate } from "@/features/si2pem/components/measurementSummary";

type PemPopupProps = {
  stationId: string | null;
  operatorName: string | null;
  operatorMnc: number | null;
  regionName: string | null;
  status: PlannedStatus;
  disabledDate: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  labName: string | null;
  labPca: string | null;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  onClose: () => void;
  onOpenStation?: () => void;
};

export function PemPopupContent({
  stationId,
  operatorName,
  operatorMnc,
  regionName,
  status,
  disabledDate,
  dateFrom,
  dateTo,
  labName,
  labPca,
  city,
  address,
  latitude,
  longitude,
  onClose,
  onOpenStation,
}: PemPopupProps) {
  const { t, i18n } = useTranslation(["pem", "main"]);
  const date = getMeasurementDate(
    { status, disabled_date: disabledDate, date: { from: dateFrom, to: dateTo } },
    i18n.resolvedLanguage ?? i18n.language,
  );

  return (
    <div className="w-72 text-sm">
      <PopupLocationHeader city={city} region={regionName} address={address} actions={<CloseButton size="xs" onClick={onClose} />} />
      <PopupRow
        mnc={operatorMnc}
        onOpen={onOpenStation}
        title={
          <>
            <PopupOperatorName name={operatorName || t("main:unknownOperator")} />
            <PopupStationId id={stationId ?? "-"} />
          </>
        }
      >
        <span className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px] leading-4">
          <span className="text-muted-foreground">{status === "INACTIVE" ? t("pem:table.disabledDate") : t("pem:table.measurementDate")}</span>
          <span className="text-foreground/80 tabular-nums">{date}</span>
          {labName || labPca ? (
            <>
              <span className="text-muted-foreground">{t("pem:table.lab")}</span>
              <span className="text-foreground/80">
                {labName}
                {labName && labPca ? " " : null}
                {labPca ? <span className="text-muted-foreground">({labPca})</span> : null}
              </span>
            </>
          ) : null}
        </span>
      </PopupRow>
      <PopupCoordinatesFooter latitude={latitude} longitude={longitude} />
    </div>
  );
}

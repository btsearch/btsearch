import { useTranslation } from "react-i18next";

import type { PlannedStatus } from "@/features/si2pem/api";
import { MeasurementSummary, type MeasurementSummaryData } from "@/features/si2pem/components/measurementSummary";

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
}: PemPopupProps) {
  const { t, i18n } = useTranslation(["pem", "common"]);
  const measurement: MeasurementSummaryData = {
    station_id: stationId,
    operator: operatorName ? { name: operatorName, mnc: operatorMnc } : null,
    region: regionName ? { name: regionName } : null,
    location: { city, address },
    status,
    disabled_date: disabledDate,
    date: dateFrom !== null || dateTo !== null ? { from: dateFrom, to: dateTo } : null,
    lab: labName ? { name: labName } : null,
  };

  return (
    <div className="w-80 px-3 py-2.5 pr-8 text-sm">
      <MeasurementSummary
        measurement={measurement}
        locale={i18n.resolvedLanguage ?? i18n.language}
        unknownCityLabel={t("table.unknownCity", { ns: "pem" })}
        noAddressLabel={t("notFound.address", { ns: "common" })}
        stackLab
        labDetail={labPca}
      />
    </div>
  );
}

import { FileChartLineIcon } from "@hugeicons/core-free-icons";
import type { EmfMeasurement } from "@openbts/shared/contract";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

import { type MeasurementTab, type MeasurementTabRow, isInactiveSite } from "../api";
import { MeasurementSummary, getLaboratoryName, getMeasurementDate } from "./measurementSummary";
import {
  type PEMDataTableProps,
  PEMDataTableShell,
  PEMDocumentLink,
  PEMLinksCell,
  PEMLocationCell,
  PEMMobileRowActions,
  PEMStationCell,
  getPEMRowContext,
} from "./pemDataTable";
import type { AppTableFeatures } from "@/lib/tableFeatures";

type Props = PEMDataTableProps<MeasurementTabRow> & {
  tab: MeasurementTab;
};

function getMeasurementKey(measurement: MeasurementTabRow) {
  if (!isInactiveSite(measurement) && measurement.id !== null) return String(measurement.id);

  const { siteId, operatorId, location } = measurement;
  const dates = isInactiveSite(measurement)
    ? [measurement.disabledOn]
    : [measurement.status, measurement.startsOn, measurement.endsOn, measurement.laboratory?.accreditationNumber];
  return [siteId, operatorId, location.latitude, location.longitude, ...dates].join(":");
}

type MeasurementReportLinkProps = {
  measurement: EmfMeasurement;
  t: TFunction;
};

function MeasurementReportLink({ measurement, t }: MeasurementReportLinkProps) {
  return (
    <PEMDocumentLink
      href={measurement.reportUrl}
      label={t("table.measurementReport")}
      context={getPEMRowContext(measurement, t)}
      icon={FileChartLineIcon}
    />
  );
}

type MobileRowProps = {
  measurement: MeasurementTabRow;
  locale: string;
  t: TFunction;
  tCommon: TFunction;
  onOpenStation: (stationId: number) => void;
};

function MeasurementMobileRow({ measurement, locale, t, tCommon, onOpenStation }: MobileRowProps) {
  return (
    <MeasurementSummary
      measurement={measurement}
      locale={locale}
      unknownCityLabel={t("table.unknownCity")}
      noAddressLabel={tCommon("notFound.address")}
      action={<PEMMobileRowActions row={measurement} t={t} tCommon={tCommon} onOpenStation={onOpenStation} />}
      footerAction={
        !isInactiveSite(measurement) && measurement.status === "completed" && measurement.reportUrl ? (
          <MeasurementReportLink measurement={measurement} t={t} />
        ) : null
      }
    />
  );
}

export function MeasurementsDataTable({ tab, t, tCommon, locale, onOpenStation, ...props }: Props) {
  const measurementColumns: ColumnDef<AppTableFeatures, MeasurementTabRow>[] = [
    {
      id: "measurementDate",
      header: tab === "inactive" ? t("table.disabledDate") : t("table.measurementDate"),
      size: 180,
      cell: ({ row }) => <span className="text-sm text-muted-foreground tabular-nums">{getMeasurementDate(row.original, locale)}</span>,
    },
  ];

  if (tab !== "inactive") {
    measurementColumns.push({
      id: "laboratory",
      header: t("table.lab"),
      size: 200,
      cell: ({ row }) => <span className="block truncate text-sm text-muted-foreground">{getLaboratoryName(row.original) ?? "-"}</span>,
    });
  }

  const columns: ColumnDef<AppTableFeatures, MeasurementTabRow>[] = [
    {
      id: "station",
      header: tCommon("labels.station"),
      size: 250,
      cell: ({ row }) => {
        const operator = row.original.operator;
        return (
          <PEMStationCell
            siteId={row.original.siteId}
            operator={operator}
            subtitle={operator && operator.legalName !== operator.name ? operator.legalName : null}
          />
        );
      },
    },
    ...measurementColumns,
    {
      accessorKey: "location",
      header: tCommon("labels.location"),
      size: 300,
      cell: ({ row }) => (
        <PEMLocationCell
          city={row.original.location.city || t("table.unknownCity")}
          regionName={row.original.region?.name}
          address={row.original.location.address}
          noAddressLabel={tCommon("notFound.address")}
        />
      ),
    },
    {
      id: "links",
      header: () => <span className="sr-only">{t("common:labels.links")}</span>,
      size: tab === "completed" ? 170 : 140,
      cell: ({ row }) => (
        <PEMLinksCell row={row.original} t={t} tCommon={tCommon} onOpenStation={onOpenStation}>
          {tab === "completed" && !isInactiveSite(row.original) ? <MeasurementReportLink measurement={row.original} t={t} /> : null}
        </PEMLinksCell>
      ),
    },
  ];

  return (
    <PEMDataTableShell
      {...props}
      columns={columns}
      caption={t("table.caption")}
      t={t}
      tCommon={tCommon}
      getRowKey={getMeasurementKey}
      renderMobileRow={(measurement) => (
        <MeasurementMobileRow measurement={measurement} locale={locale} t={t} tCommon={tCommon} onOpenStation={onOpenStation} />
      )}
    />
  );
}

import { FileChartLineIcon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { useMemo } from "react";

import type { PlannedPEMStation } from "../api";
import { MeasurementSummary, getMeasurementDate } from "./measurementSummary";
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

type Props = PEMDataTableProps<PlannedPEMStation> & {
  status: PlannedPEMStation["status"];
};

function getMeasurementKey(measurement: PlannedPEMStation) {
  if (measurement.id !== null) return String(measurement.id);
  return [
    measurement.station_id,
    measurement.operator?.mnc,
    measurement.location.latitude,
    measurement.location.longitude,
    measurement.status,
    measurement.disabled_date,
    measurement.date?.from,
    measurement.date?.to,
    measurement.lab?.PCA,
  ].join(":");
}

type MeasurementReportLinkProps = {
  measurement: PlannedPEMStation;
  t: TFunction;
};

function MeasurementReportLink({ measurement, t }: MeasurementReportLinkProps) {
  return (
    <PEMDocumentLink
      href={measurement.report_url}
      label={t("table.measurementReport")}
      context={getPEMRowContext(measurement, t)}
      icon={FileChartLineIcon}
    />
  );
}

type MobileRowProps = {
  measurement: PlannedPEMStation;
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
      footerAction={measurement.status === "COMPLETED" && measurement.report_url ? <MeasurementReportLink measurement={measurement} t={t} /> : null}
    />
  );
}

export function MeasurementsDataTable({ status, t, tCommon, locale, onOpenStation, ...props }: Props) {
  const columns = useMemo<ColumnDef<AppTableFeatures, PlannedPEMStation>[]>(() => {
    const measurementColumns: ColumnDef<AppTableFeatures, PlannedPEMStation>[] = [
      {
        id: "measurementDate",
        header: status === "INACTIVE" ? t("table.disabledDate") : t("table.measurementDate"),
        size: 180,
        cell: ({ row }) => <span className="text-sm text-muted-foreground tabular-nums">{getMeasurementDate(row.original, locale)}</span>,
      },
    ];

    if (status !== "INACTIVE")
      measurementColumns.push({
        accessorKey: "lab.name",
        header: t("table.lab"),
        size: 200,
        cell: ({ getValue }) => <span className="block truncate text-sm text-muted-foreground">{getValue<string | null>() ?? "-"}</span>,
      });

    return [
      {
        id: "station",
        header: tCommon("labels.station"),
        size: 250,
        cell: ({ row }) => {
          const operator = row.original.operator;
          return (
            <PEMStationCell
              stationId={row.original.station_id}
              operator={operator}
              subtitle={operator && operator.full_name !== operator.name ? operator.full_name : null}
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
        header: () => <span className="sr-only">{t("table.links")}</span>,
        size: status === "COMPLETED" ? 170 : 140,
        cell: ({ row }) => (
          <PEMLinksCell row={row.original} t={t} tCommon={tCommon} onOpenStation={onOpenStation}>
            {status === "COMPLETED" ? <MeasurementReportLink measurement={row.original} t={t} /> : null}
          </PEMLinksCell>
        ),
      },
    ];
  }, [t, tCommon, locale, status, onOpenStation]);

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

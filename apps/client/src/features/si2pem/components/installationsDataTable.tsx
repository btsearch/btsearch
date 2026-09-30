import { FileChartLineIcon, FileEditIcon } from "@hugeicons/core-free-icons";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

import type { PEMInstallation } from "../api";
import { PEMRecordSummary } from "./measurementSummary";
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
import { formatFullDate, formatShortDate } from "@/lib/format";
import type { AppTableFeatures } from "@/lib/tableFeatures";

function getInstallationKey(installation: PEMInstallation) {
  return [
    installation.station_id,
    installation.entity,
    installation.published_at,
    installation.reference_no,
    installation.installation_file,
    installation.report_file,
  ].join(":");
}

function formatRegistrationDate(date: string, locale: string) {
  return new Date(date).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

type InstallationProps = {
  installation: PEMInstallation;
  t: TFunction;
};

function InstallationDocuments({ installation, t }: InstallationProps) {
  const context = getPEMRowContext(installation, t);
  return (
    <>
      <PEMDocumentLink href={installation.installation_file} label={t("table.installationForm")} context={context} icon={FileEditIcon} />
      <PEMDocumentLink href={installation.report_file} label={t("table.measurementReport")} context={context} icon={FileChartLineIcon} />
    </>
  );
}

function InstallationDates({ installation, t, locale }: InstallationProps & { locale: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <time dateTime={installation.published_at} title={formatFullDate(installation.published_at, locale)} className="text-sm tabular-nums">
        {formatShortDate(installation.published_at, locale)}
      </time>
      {installation.registration_date ? (
        <span className="truncate text-xs text-muted-foreground tabular-nums">
          {t("installations.registeredOn", { date: formatRegistrationDate(installation.registration_date, locale) })}
        </span>
      ) : null}
    </div>
  );
}

type MobileRowProps = InstallationProps & {
  locale: string;
  tCommon: TFunction;
  onOpenStation: (stationId: number) => void;
};

function InstallationMobileRow({ installation, locale, t, tCommon, onOpenStation }: MobileRowProps) {
  return (
    <PEMRecordSummary
      stationId={installation.station_id}
      operator={installation.operator}
      city={installation.location.city || t("table.unknownCity")}
      regionName={installation.region?.name}
      address={installation.location.address}
      noAddressLabel={tCommon("notFound.address")}
      action={<PEMMobileRowActions row={installation} t={t} tCommon={tCommon} onOpenStation={onOpenStation} />}
      footer={
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <time dateTime={installation.published_at} className="shrink-0 tabular-nums">
              {formatShortDate(installation.published_at, locale)}
            </time>
            {installation.reference_no ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate font-mono">{installation.reference_no}</span>
              </>
            ) : null}
          </div>
          <div className="-my-1 flex shrink-0 items-center gap-1">
            <InstallationDocuments installation={installation} t={t} />
          </div>
        </div>
      }
    />
  );
}

export function InstallationsDataTable({ t, tCommon, locale, onOpenStation, ...props }: PEMDataTableProps<PEMInstallation>) {
  const columns: ColumnDef<AppTableFeatures, PEMInstallation>[] = [
    {
      id: "publishedAt",
      header: t("installations.publishedAt"),
      size: 180,
      cell: ({ row }) => <InstallationDates installation={row.original} t={t} locale={locale} />,
    },
    {
      id: "station",
      header: tCommon("labels.station"),
      size: 250,
      cell: ({ row }) => (
        <PEMStationCell
          stationId={row.original.station_id}
          operator={row.original.operator}
          subtitle={row.original.station_name ?? (row.original.operator ? null : row.original.entity)}
        />
      ),
    },
    {
      id: "location",
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
      accessorKey: "reference_no",
      header: t("installations.referenceNo"),
      size: 200,
      cell: ({ getValue }) => {
        const referenceNo = getValue<string | null>();
        if (!referenceNo) return <span className="text-muted-foreground">-</span>;
        return (
          <span title={referenceNo} className="block truncate font-mono text-xs text-muted-foreground">
            {referenceNo}
          </span>
        );
      },
    },
    {
      id: "links",
      header: () => <span className="sr-only">{t("common:labels.links")}</span>,
      size: 200,
      cell: ({ row }) => (
        <PEMLinksCell row={row.original} t={t} tCommon={tCommon} onOpenStation={onOpenStation}>
          <InstallationDocuments installation={row.original} t={t} />
        </PEMLinksCell>
      ),
    },
  ];

  return (
    <PEMDataTableShell
      {...props}
      columns={columns}
      caption={t("installations.caption")}
      t={t}
      tCommon={tCommon}
      getRowKey={getInstallationKey}
      renderMobileRow={(installation) => (
        <InstallationMobileRow installation={installation} locale={locale} t={t} tCommon={tCommon} onOpenStation={onOpenStation} />
      )}
    />
  );
}

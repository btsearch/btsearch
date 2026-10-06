import { FileChartLineIcon, FileEditIcon } from "@hugeicons/core-free-icons";
import type { EmfFiling } from "@openbts/shared/contract";
import type { ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";

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
import { formatFullDate, formatShortDate, formatShortUtcDate } from "@/lib/format";
import type { AppTableFeatures } from "@/lib/tableFeatures";

function getInstallationKey(installation: EmfFiling) {
  return [
    installation.siteId,
    installation.filerName,
    installation.publishedAt,
    installation.referenceNumber,
    installation.installationDocumentUrl,
    installation.reportUrl,
  ].join(":");
}

type InstallationProps = {
  installation: EmfFiling;
  t: TFunction;
};

function InstallationDocuments({ installation, t }: InstallationProps) {
  const context = getPEMRowContext(installation, t);
  return (
    <>
      <PEMDocumentLink href={installation.installationDocumentUrl} label={t("table.installationForm")} context={context} icon={FileEditIcon} />
      <PEMDocumentLink href={installation.reportUrl} label={t("table.measurementReport")} context={context} icon={FileChartLineIcon} />
    </>
  );
}

function InstallationDates({ installation, t, locale }: InstallationProps & { locale: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <time dateTime={installation.publishedAt} title={formatFullDate(installation.publishedAt, locale)} className="text-sm tabular-nums">
        {formatShortDate(installation.publishedAt, locale)}
      </time>
      {installation.registeredOn ? (
        <span className="truncate text-xs text-muted-foreground tabular-nums">
          {t("installations.registeredOn", { date: formatShortUtcDate(installation.registeredOn, locale) })}
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
      siteId={installation.siteId}
      operator={installation.operator}
      city={installation.location.city || t("table.unknownCity")}
      regionName={installation.region?.name}
      address={installation.location.address}
      noAddressLabel={tCommon("notFound.address")}
      action={<PEMMobileRowActions row={installation} t={t} tCommon={tCommon} onOpenStation={onOpenStation} />}
      footer={
        <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <time dateTime={installation.publishedAt} className="shrink-0 tabular-nums">
              {formatShortDate(installation.publishedAt, locale)}
            </time>
            {installation.referenceNumber ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate font-mono">{installation.referenceNumber}</span>
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

export function InstallationsDataTable({ t, tCommon, locale, onOpenStation, ...props }: PEMDataTableProps<EmfFiling>) {
  const columns: ColumnDef<AppTableFeatures, EmfFiling>[] = [
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
          siteId={row.original.siteId}
          operator={row.original.operator}
          subtitle={row.original.siteName ?? (row.original.operator ? null : row.original.filerName)}
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
      accessorKey: "referenceNumber",
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

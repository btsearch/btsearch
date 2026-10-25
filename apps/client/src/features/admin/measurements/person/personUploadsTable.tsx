import { Download04Icon } from "@hugeicons/core-free-icons";
import type { MeasurementUpload } from "@openbts/shared/contract";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { SECOND_LINE_CLASS } from "../components/classNames";
import { UploadDiscoveriesSummary, UploadStatusSummary } from "../components/uploadCells";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import { CardTable, CardTableCell, CardTableHead, CardTableRow } from "@/features/admin/reference/components/shared/cardTable";
import { type UploadResult, countDroppedReadings, listUploadDrops } from "@/features/settings/components/measurements/uploadResult";
import { RowIconButton } from "@/features/settings/components/settingsPrimitives";
import { showUploadError } from "@/features/settings/measurementErrors";
import { downloadMeasurementUploadFile, measurementDeviceName } from "@/features/settings/measurementQueries";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

const SKELETON_BAR_WIDTHS = ["w-28", "w-24", "w-20", "w-32", "w-16", "w-12"];

function lowerFirst(text: string, language: string): string {
  return text.charAt(0).toLocaleLowerCase(language) + text.slice(1);
}

function getDropSummary(t: TFunction, language: string, result: UploadResult): string {
  const drops = listUploadDrops(result);
  if (drops.length === 0) return t("settings:measurements.uploads.details.noDrops");

  const { closedCountryCodes } = result.samples;
  const reasons = drops.map(({ reason, count }) => {
    const label = lowerFirst(t(`settings:measurements.uploads.dropReasons.${reason}.label`), language);
    const countries =
      reason === "closedCountry" && closedCountryCodes.length > 0
        ? ` (${closedCountryCodes.map((code) => getCountryName(code, language)).join(", ")})`
        : "";
    return `${label}${countries} ${count.toLocaleString(language)}`;
  });
  return t("measurements.person.uploads.dropped", { dropped: countDroppedReadings(result), reasons: reasons.join(", ") });
}

function SamplesCell({ result }: { result: UploadResult }) {
  const { t, i18n } = useTranslation(["admin", "settings"]);
  const { kept, total, distanceOnly } = result.samples;
  const drops = getDropSummary(t, i18n.language, result);

  return (
    <div className="min-w-0">
      <span className="block truncate">
        <span className="tabular-nums">{t("settings:measurements.uploads.details.keptValue", { kept, total })}</span>
        {distanceOnly > 0 ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {t("settings:measurements.uploads.details.distanceOnly", { readings: distanceOnly })}
          </span>
        ) : null}
      </span>
      <span className={SECOND_LINE_CLASS} title={drops}>
        {drops}
      </span>
    </div>
  );
}

function UploadRow({ upload, isDownloading, onDownload }: { upload: MeasurementUpload; isDownloading: boolean; onDownload: () => void }) {
  const { t, i18n } = useTranslation(["admin", "settings"]);

  return (
    <CardTableRow className="h-14">
      <CardTableCell className="whitespace-nowrap tabular-nums">{formatDateTime(upload.receivedAt, i18n.language)}</CardTableCell>
      <CardTableCell className="max-w-44">
        <span className="block truncate">{upload.device === undefined ? <EmptyValue /> : measurementDeviceName(upload.device)}</span>
      </CardTableCell>
      <CardTableCell className="max-w-52">
        <UploadStatusSummary upload={upload} />
      </CardTableCell>
      <CardTableCell className="max-w-96">{upload.result === null ? <EmptyValue /> : <SamplesCell result={upload.result} />}</CardTableCell>
      <CardTableCell className="max-w-44">
        {upload.result === null ? <EmptyValue /> : <UploadDiscoveriesSummary discoveries={upload.result.discoveries} />}
      </CardTableCell>
      <CardTableCell className="whitespace-nowrap tabular-nums">{formatFileSize(upload.sizeBytes)}</CardTableCell>
      <CardTableCell align="end">
        {upload.fileExpiresAt === null ? null : (
          <RowIconButton label={t("settings:measurements.uploads.download")} icon={Download04Icon} disabled={isDownloading} onClick={onDownload} />
        )}
      </CardTableCell>
    </CardTableRow>
  );
}

function UploadRowSkeleton() {
  return (
    <CardTableRow aria-hidden="true" className="h-14">
      {SKELETON_BAR_WIDTHS.map((width, index) => (
        <CardTableCell key={index}>
          <Skeleton className={cn("h-4", width)} />
        </CardTableCell>
      ))}
      <CardTableCell />
    </CardTableRow>
  );
}

export function PersonUploadsTable({ uploads, skeletonRowCount }: { uploads: readonly MeasurementUpload[] | null; skeletonRowCount: number }) {
  const { t } = useTranslation("admin");
  const downloadMutation = useMutation({ mutationFn: downloadMeasurementUploadFile, onError: showUploadError });

  return (
    <CardTable
      className="min-w-[60rem]"
      head={
        <>
          <CardTableHead>{t("measurements.uploads.columns.receivedAt")}</CardTableHead>
          <CardTableHead>{t("measurements.uploads.columns.device")}</CardTableHead>
          <CardTableHead>{t("common:labels.status")}</CardTableHead>
          <CardTableHead>{t("measurements.uploads.columns.samples")}</CardTableHead>
          <CardTableHead>{t("measurements.uploads.columns.discoveries")}</CardTableHead>
          <CardTableHead>{t("measurements.uploads.columns.size")}</CardTableHead>
          <CardTableHead align="end">
            <span className="sr-only">{t("measurements.uploads.columns.actions")}</span>
          </CardTableHead>
        </>
      }
    >
      {uploads === null
        ? Array.from({ length: skeletonRowCount }, (_, index) => <UploadRowSkeleton key={index} />)
        : uploads.map((upload) => (
            <UploadRow
              key={upload.id}
              upload={upload}
              isDownloading={downloadMutation.isPending && downloadMutation.variables?.id === upload.id}
              onDownload={() => downloadMutation.mutate(upload)}
            />
          ))}
    </CardTable>
  );
}

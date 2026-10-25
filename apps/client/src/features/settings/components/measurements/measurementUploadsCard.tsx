import { Download04Icon, File01Icon, TriangleAlertIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MeasurementUpload, MeasurementUploadStatus } from "@openbts/shared/contract";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../../authErrors";
import { showUploadError } from "../../measurementErrors";
import {
  downloadMeasurementUploadFile,
  measurementDeviceName,
  measurementDevicesQueryOptions,
  measurementSummaryQueryOptions,
  measurementUploadsQueryOptions,
  withdrawAllMeasurementUploads,
  withdrawMeasurementUpload,
} from "../../measurementQueries";
import { ConfirmDialog } from "../confirmDialog";
import {
  RowIconButton,
  SETTINGS_DESCRIPTION_CLASS,
  SettingsCard,
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsMeta,
  SettingsMetaItem,
  SettingsRow,
  SettingsRowError,
  SettingsRowPanel,
  SettingsRowSkeleton,
  SettingsRowToggle,
} from "../settingsPrimitives";
import { UploadDiscoveries, UploadDrops, UploadKeptReadings, type UploadResult, UploadTimes } from "./uploadResult";
import { UploadStatusBadge, readUploadStatusReason } from "./uploadStatus";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime, formatFileSize, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DESTRUCTIVE_GHOST_CLASS = "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15";

const WITHDRAWABLE_STATUSES: ReadonlySet<MeasurementUploadStatus> = new Set(["received", "processing", "processed", "rejected"]);
const WAITING_STATUSES: ReadonlySet<MeasurementUploadStatus> = new Set(["received", "processing"]);

function UploadDetails({ result }: { result: UploadResult }) {
  return (
    <div className="grid gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @4xl:gap-x-10">
      <div>
        <UploadKeptReadings samples={result.samples} />
        <UploadDrops result={result} className="mt-4" />
      </div>
      <div className="flex flex-col gap-4">
        <UploadDiscoveries discoveries={result.discoveries} />
        <UploadTimes result={result} />
      </div>
    </div>
  );
}

function readFileLine(t: TFunction, upload: MeasurementUpload, language: string): string {
  if (upload.fileExpiresAt === null) return t("measurements.uploads.fileDeleted");
  if (upload.status === "withdrawn") return t("measurements.uploads.fileDeletedSoon");
  return t("measurements.uploads.fileUntil", { date: formatShortDate(upload.fileExpiresAt, language) });
}

type UploadRowProps = {
  upload: MeasurementUpload;
  deviceName: string | undefined;
  isDownloading: boolean;
  onDownload: () => void;
  onWithdraw: () => void;
};

function UploadRow({ upload, deviceName, isDownloading, onDownload, onWithdraw }: UploadRowProps) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const [isDetailsOpen, setDetailsOpen] = useState(false);
  const { result } = upload;
  const reason = readUploadStatusReason(t, upload);
  const hasFile = upload.fileExpiresAt !== null;
  const canWithdraw = WITHDRAWABLE_STATUSES.has(upload.status);

  const row = (
    <SettingsRow
      wrap
      icon={File01Icon}
      title={formatDateTime(upload.receivedAt, i18n.language)}
      badge={<UploadStatusBadge status={upload.status} />}
      description={
        <>
          <SettingsMeta>
            {deviceName !== undefined ? <SettingsMetaItem>{deviceName}</SettingsMetaItem> : null}
            <SettingsMetaItem>{formatFileSize(upload.sizeBytes)}</SettingsMetaItem>
            <SettingsMetaItem>{readFileLine(t, upload, i18n.language)}</SettingsMetaItem>
          </SettingsMeta>
          {upload.status === "processed" && result !== null ? (
            <SettingsMeta>
              <SettingsMetaItem>
                <span className="tabular-nums">
                  {t("measurements.uploads.keptOfTotal", { kept: result.samples.kept, count: result.samples.total })}
                </span>
              </SettingsMetaItem>
              {result.discoveries.cells > 0 ? (
                <SettingsMetaItem>{t("measurements.uploads.newCells", { count: result.discoveries.cells })}</SettingsMetaItem>
              ) : null}
              {result.discoveries.sites > 0 ? (
                <SettingsMetaItem>{t("measurements.uploads.newSites", { count: result.discoveries.sites })}</SettingsMetaItem>
              ) : null}
            </SettingsMeta>
          ) : null}
          {WAITING_STATUSES.has(upload.status) ? <span className="block">{t("measurements.uploads.waiting")}</span> : null}
          {reason !== null ? <span className="block">{reason}</span> : null}
        </>
      }
    >
      {hasFile || canWithdraw || result !== null ? (
        <>
          {hasFile ? (
            <RowIconButton label={t("measurements.uploads.download")} icon={Download04Icon} disabled={isDownloading} onClick={onDownload} />
          ) : null}
          {canWithdraw ? (
            <Button type="button" variant="ghost" size="sm" className={DESTRUCTIVE_GHOST_CLASS} onClick={onWithdraw}>
              {t("measurements.uploads.withdraw")}
            </Button>
          ) : null}
          {result !== null ? (
            <SettingsRowToggle
              isOpen={isDetailsOpen}
              label={isDetailsOpen ? t("measurements.uploads.hideDetails") : t("measurements.uploads.showDetails")}
            />
          ) : null}
        </>
      ) : null}
    </SettingsRow>
  );

  if (result === null) return row;

  return (
    <Collapsible open={isDetailsOpen} onOpenChange={setDetailsOpen} className="border-t first:border-t-0">
      {row}
      <SettingsRowPanel>
        <UploadDetails result={result} />
      </SettingsRowPanel>
    </Collapsible>
  );
}

export function MeasurementUploadsCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const { data, isPending, isFetching, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(
    measurementUploadsQueryOptions(userId),
  );
  const { data: devices } = useQuery(measurementDevicesQueryOptions(userId));
  const [withdrawTarget, setWithdrawTarget] = useState<MeasurementUpload | null>(null);
  const [isWithdrawAllOpen, setWithdrawAllOpen] = useState(false);

  const refreshAfterWithdrawal = () => {
    void queryClient.invalidateQueries({ queryKey: measurementUploadsQueryOptions(userId).queryKey });
    void queryClient.invalidateQueries({ queryKey: measurementSummaryQueryOptions(userId).queryKey });
  };

  const withdrawMutation = useMutation({
    mutationFn: withdrawMeasurementUpload,
    onSuccess: () => {
      setWithdrawTarget(null);
      toast.success(t("measurements.uploads.withdrawSuccess"));
    },
    onError: showUploadError,
    onSettled: refreshAfterWithdrawal,
  });

  const withdrawAllMutation = useMutation({
    mutationFn: withdrawAllMeasurementUploads,
    onSuccess: (withdrawnCount) => {
      setWithdrawAllOpen(false);
      toast.success(t("measurements.uploads.withdrawAllSuccess", { count: withdrawnCount }));
      refreshAfterWithdrawal();
    },
    onError: showSettingsError,
  });

  const downloadMutation = useMutation({ mutationFn: downloadMeasurementUploadFile, onError: showUploadError });

  const showMore = async () => {
    const result = await fetchNextPage();
    if (result.isFetchNextPageError) showSettingsError(result.error);
  };

  const deviceNames = new Map((devices ?? []).map((device) => [device.id, measurementDeviceName(device)]));
  const uploads = data?.pages.flatMap((page) => page.data) ?? [];
  const total = data?.pages[0].paging.total ?? uploads.length;

  return (
    <SettingsCard>
      <SettingsCardHeader
        wrap
        title={t("measurements.uploads.title")}
        description={t("measurements.uploads.description")}
        action={
          data !== undefined && uploads.length === 0 ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={DESTRUCTIVE_GHOST_CLASS}
              disabled={data === undefined}
              onClick={() => setWithdrawAllOpen(true)}
            >
              {t("measurements.uploads.withdrawAll")}
            </Button>
          )
        }
      />
      <div className="border-t">
        {isPending ? (
          <SettingsRowSkeleton />
        ) : data === undefined ? (
          <SettingsRowError title={t("measurements.uploads.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        ) : uploads.length === 0 ? (
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm leading-5 font-medium">{t("measurements.uploads.empty")}</p>
            <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("measurements.uploads.emptyDescription")}</p>
          </div>
        ) : (
          uploads.map((upload) => (
            <UploadRow
              key={upload.id}
              upload={upload}
              deviceName={deviceNames.get(upload.deviceId)}
              isDownloading={downloadMutation.isPending && downloadMutation.variables?.id === upload.id}
              onDownload={() => downloadMutation.mutate(upload)}
              onWithdraw={() => setWithdrawTarget(upload)}
            />
          ))
        )}
      </div>
      {hasNextPage ? (
        <SettingsCardFooter>
          <span className={SETTINGS_DESCRIPTION_CLASS}>{t("common:pagination.showing", { shown: uploads.length, total })}</span>
          <Button type="button" variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void showMore()}>
            {isFetchingNextPage ? <Spinner /> : null}
            {t("common:actions.showMore")}
          </Button>
        </SettingsCardFooter>
      ) : null}

      <ConfirmDialog
        open={withdrawTarget !== null}
        onOpenChange={(open) => {
          if (!open) setWithdrawTarget(null);
        }}
        title={t("measurements.uploads.withdrawConfirmTitle")}
        description={t("measurements.uploads.withdrawConfirmDescription", {
          date: withdrawTarget === null ? "" : formatDateTime(withdrawTarget.receivedAt, i18n.language),
        })}
        confirmLabel={t("measurements.uploads.withdraw")}
        pending={withdrawMutation.isPending}
        onConfirm={() => {
          if (withdrawTarget !== null) withdrawMutation.mutate(withdrawTarget.id);
        }}
      />
      <AlertDialog open={isWithdrawAllOpen} onOpenChange={setWithdrawAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
              <HugeiconsIcon icon={TriangleAlertIcon} />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("measurements.uploads.withdrawAllConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("measurements.uploads.withdrawAllConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdrawAllMutation.isPending}>{t("common:actions.cancel")}</AlertDialogCancel>
            <Button variant="destructive" disabled={withdrawAllMutation.isPending} onClick={() => withdrawAllMutation.mutate()}>
              {withdrawAllMutation.isPending ? <Spinner /> : null}
              {t("measurements.uploads.withdrawAll")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}

import { Alert02Icon, Cancel01Icon, Clock01Icon, Download04Icon, File01Icon, Tick02Icon, TriangleAlertIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { MeasurementUpload, MeasurementUploadStatus } from "@openbts/shared/contract";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { showSettingsError } from "../authErrors";
import {
  downloadMeasurementUploadFile,
  measurementDeviceName,
  measurementDevicesQueryOptions,
  measurementUploadsQueryOptions,
  withdrawAllMeasurementUploads,
  withdrawMeasurementUpload,
} from "../measurementQueries";
import { ConfirmDialog } from "./confirmDialog";
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
  SettingsRowSkeleton,
  StatusBadge,
} from "./settingsPrimitives";
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
import { Spinner } from "@/components/ui/spinner";
import { getDateFormatter } from "@/lib/dateFormat";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

const UPLOAD_STATUS_BADGES: Record<
  MeasurementUploadStatus,
  { labelKey: string; tone: ComponentProps<typeof StatusBadge>["tone"]; icon?: IconSvgElement }
> = {
  received: { labelKey: "measurements.uploads.statuses.received", tone: "muted", icon: Clock01Icon },
  processing: { labelKey: "measurements.uploads.statuses.processing", tone: "primary" },
  processed: { labelKey: "measurements.uploads.statuses.processed", tone: "success", icon: Tick02Icon },
  rejected: { labelKey: "common:status.rejected", tone: "warning", icon: Cancel01Icon },
  withdrawn: { labelKey: "measurements.uploads.statuses.withdrawn", tone: "muted" },
  excluded: { labelKey: "measurements.uploads.statuses.excluded", tone: "warning", icon: Alert02Icon },
};

const WITHDRAWABLE_STATUSES: ReadonlySet<MeasurementUploadStatus> = new Set(["received", "processing", "processed", "rejected"]);
const STATUSES_WITH_REASON: ReadonlySet<MeasurementUploadStatus> = new Set(["rejected", "excluded"]);

function UploadRow({
  upload,
  deviceName,
  receivedAt,
  formatDate,
  isDownloading,
  onDownload,
  onWithdraw,
}: {
  upload: MeasurementUpload;
  deviceName: string | undefined;
  receivedAt: string;
  formatDate: (value: string) => string;
  isDownloading: boolean;
  onDownload: () => void;
  onWithdraw: () => void;
}) {
  const { t } = useTranslation("settings");
  const badge = UPLOAD_STATUS_BADGES[upload.status];
  const hasFile = upload.fileExpiresAt !== null;
  const canWithdraw = WITHDRAWABLE_STATUSES.has(upload.status);
  const fileLine =
    upload.fileExpiresAt === null
      ? t("measurements.uploads.fileDeleted")
      : upload.status === "withdrawn"
        ? t("measurements.uploads.fileDeletedSoon")
        : t("measurements.uploads.fileUntil", { date: formatDate(upload.fileExpiresAt) });

  return (
    <SettingsRow
      wrap
      icon={File01Icon}
      title={receivedAt}
      badge={
        <StatusBadge tone={badge.tone} icon={badge.icon}>
          {t(badge.labelKey)}
        </StatusBadge>
      }
      description={
        <>
          <SettingsMeta>
            {deviceName !== undefined ? <SettingsMetaItem>{deviceName}</SettingsMetaItem> : null}
            <SettingsMetaItem>{formatFileSize(upload.sizeBytes)}</SettingsMetaItem>
            <SettingsMetaItem>{fileLine}</SettingsMetaItem>
          </SettingsMeta>
          {upload.statusReason !== null && STATUSES_WITH_REASON.has(upload.status) ? (
            <span className="block">{t("measurements.reason", { reason: upload.statusReason })}</span>
          ) : null}
        </>
      }
    >
      {hasFile || canWithdraw ? (
        <>
          {hasFile ? (
            <RowIconButton label={t("measurements.uploads.download")} icon={Download04Icon} disabled={isDownloading} onClick={onDownload} />
          ) : null}
          {canWithdraw ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
              onClick={onWithdraw}
            >
              {t("measurements.uploads.withdraw")}
            </Button>
          ) : null}
        </>
      ) : null}
    </SettingsRow>
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

  const withdrawMutation = useMutation({
    mutationFn: withdrawMeasurementUpload,
    onSuccess: () => {
      setWithdrawTarget(null);
      toast.success(t("measurements.uploads.withdrawSuccess"));
      void queryClient.invalidateQueries({ queryKey: measurementUploadsQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const withdrawAllMutation = useMutation({
    mutationFn: withdrawAllMeasurementUploads,
    onSuccess: (withdrawnCount) => {
      setWithdrawAllOpen(false);
      toast.success(t("measurements.uploads.withdrawAllSuccess", { count: withdrawnCount }));
      void queryClient.invalidateQueries({ queryKey: measurementUploadsQueryOptions(userId).queryKey });
    },
    onError: showSettingsError,
  });

  const downloadMutation = useMutation({ mutationFn: downloadMeasurementUploadFile, onError: showSettingsError });

  const showMore = async () => {
    const result = await fetchNextPage();
    if (result.isFetchNextPageError) showSettingsError(result.error);
  };

  const dateFormatter = getDateFormatter(i18n.language);
  const dateTimeFormatter = new Intl.DateTimeFormat(i18n.language, DATE_TIME_FORMAT);
  const formatDate = (value: string) => dateFormatter.format(new Date(value));
  const formatDateTime = (value: string) => dateTimeFormatter.format(new Date(value));
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
              className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/15"
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
              receivedAt={formatDateTime(upload.receivedAt)}
              formatDate={formatDate}
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
          date: withdrawTarget === null ? "" : formatDateTime(withdrawTarget.receivedAt),
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

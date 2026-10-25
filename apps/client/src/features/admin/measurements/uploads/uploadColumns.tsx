import { ArrowDown01Icon, Download04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MeasurementUpload, MeasurementUploadStatus } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";
import { type CellContext, createColumnHelper } from "@tanstack/react-table";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import { DESTRUCTIVE_GHOST_CLASS, SECOND_LINE_CLASS } from "../components/classNames";
import { ContributorIdentity } from "../components/contributorIdentity";
import { UploadDiscoveriesSummary, UploadStatusSummary } from "../components/uploadCells";
import { Button } from "@/components/ui/button";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { countDroppedReadings } from "@/features/settings/components/measurements/uploadResult";
import { RowIconButton } from "@/features/settings/components/settingsPrimitives";
import { formatDateTime, formatFileSize, formatShortDate } from "@/lib/format";
import type { AppTableFeatures } from "@/lib/tableFeatures";
import { cn } from "@/lib/utils";

export type UploadRowActions = {
  openIds: ReadonlySet<string>;
  downloadingId: string | null;
  onToggle: (uploadId: string) => void;
  onDownload: (upload: MeasurementUpload) => void;
  onExclude: (upload: MeasurementUpload) => void;
  onRestore: (upload: MeasurementUpload) => void;
};

type UploadCellProps = Pick<CellContext<AppTableFeatures, MeasurementUpload, unknown>, "row">;

const EXCLUDABLE_STATUSES: ReadonlySet<MeasurementUploadStatus> = new Set(["received", "processing", "processed"]);
const CONTRIBUTOR_LINK_CLASS = "flex min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring";
const columnHelper = createColumnHelper<AppTableFeatures, MeasurementUpload>();

export const UploadRowActionsContext = createContext<UploadRowActions | null>(null);

function useUploadRowActions(): UploadRowActions {
  const actions = useContext(UploadRowActionsContext);
  if (actions === null) throw new Error("The upload cells must render inside UploadRowActionsContext");
  return actions;
}

export function getUploadDetailsId(uploadId: string): string {
  return `upload-details-${uploadId}`;
}

function ReceivedHeader() {
  const { t } = useTranslation("admin");
  return <span className="pl-2">{t("measurements.uploads.columns.receivedAt")}</span>;
}

function ContributorHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.contributor");
}

function DeviceHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.uploads.columns.device");
}

function StatusHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.status");
}

function SamplesHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.uploads.columns.samples");
}

function DiscoveriesHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.uploads.columns.discoveries");
}

function SizeHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.uploads.columns.size");
}

function FileHeader() {
  const { t } = useTranslation("admin");
  return t("measurements.uploads.columns.fileExpiresAt");
}

function ActionsHeader() {
  const { t } = useTranslation("admin");
  return <span className="sr-only">{t("measurements.uploads.columns.actions")}</span>;
}

function ReceivedCell({ row }: UploadCellProps) {
  const { i18n } = useTranslation();
  return <span className="block pl-2 tabular-nums">{formatDateTime(row.original.receivedAt, i18n.language)}</span>;
}

function ContributorCell({ row }: UploadCellProps) {
  const uploader = row.original.uploader ?? null;
  if (uploader === null) return <ContributorIdentity user={null} />;

  return (
    <Link to="/admin/measurements/contributors/$userId" params={{ userId: uploader.id }} className={CONTRIBUTOR_LINK_CLASS}>
      <ContributorIdentity user={uploader} />
    </Link>
  );
}

function DeviceCell({ row }: UploadCellProps) {
  const { t } = useTranslation("admin");
  const { device } = row.original;
  if (device === undefined) return <EmptyValue />;

  const { manufacturer, model, socModel } = device.hardware;
  return (
    <div className="min-w-0">
      <span className="block truncate" title={`${manufacturer} ${model}`}>
        {device.label ?? model}
      </span>
      <span className={SECOND_LINE_CLASS}>{socModel ?? t("measurements.uploads.noSoc", { manufacturer })}</span>
    </div>
  );
}

function StatusCell({ row }: UploadCellProps) {
  return <UploadStatusSummary upload={row.original} />;
}

function SamplesCell({ row }: UploadCellProps) {
  const { t } = useTranslation(["admin", "settings"]);
  const { result } = row.original;
  if (result === null) return <EmptyValue />;

  const dropped = countDroppedReadings(result);
  return (
    <div className="min-w-0">
      <span className="block truncate tabular-nums">
        {t("settings:measurements.uploads.details.keptValue", { kept: result.samples.kept, total: result.samples.total })}
      </span>
      <span className={SECOND_LINE_CLASS}>
        {dropped > 0 ? t("measurements.uploads.dropped", { count: dropped }) : t("settings:measurements.uploads.details.noDrops")}
      </span>
    </div>
  );
}

function DiscoveriesCell({ row }: UploadCellProps) {
  const { result } = row.original;
  return result === null ? <EmptyValue /> : <UploadDiscoveriesSummary discoveries={result.discoveries} />;
}

function SizeCell({ row }: UploadCellProps) {
  return <span className="tabular-nums">{formatFileSize(row.original.sizeBytes)}</span>;
}

function FileCell({ row }: UploadCellProps) {
  const { t, i18n } = useTranslation("settings");
  const { fileExpiresAt } = row.original;
  const text = fileExpiresAt === null ? t("measurements.uploads.fileDeleted") : formatShortDate(fileExpiresAt, i18n.language);

  return (
    <span className="block truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground tabular-nums" title={text}>
      {text}
    </span>
  );
}

function DetailsToggle({ upload }: { upload: MeasurementUpload }) {
  const { t } = useTranslation("settings");
  const actions = useUploadRowActions();
  const isOpen = actions.openIds.has(upload.id);
  const label = isOpen ? t("measurements.uploads.hideDetails") : t("measurements.uploads.showDetails");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-expanded={isOpen}
            aria-controls={getUploadDetailsId(upload.id)}
            className={cn("cursor-pointer text-muted-foreground", isOpen && "bg-muted text-foreground")}
            onClick={() => actions.onToggle(upload.id)}
          />
        }
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          aria-hidden="true"
          className={cn("transition-transform duration-150 ease-out motion-reduce:transition-none", isOpen && "rotate-180")}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ActionsCell({ row }: UploadCellProps) {
  const { t } = useTranslation(["admin", "settings", "common"]);
  const actions = useUploadRowActions();
  const upload = row.original;
  const hasFile = upload.fileExpiresAt !== null;
  const canExclude = EXCLUDABLE_STATUSES.has(upload.status);
  const canRestore = upload.status === "excluded" && hasFile;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {hasFile ? (
        <RowIconButton
          label={t("settings:measurements.uploads.download")}
          icon={Download04Icon}
          disabled={actions.downloadingId === upload.id}
          onClick={() => actions.onDownload(upload)}
        />
      ) : (
        <span aria-hidden="true" className="size-7" />
      )}
      {canExclude ? (
        <Button type="button" variant="ghost" size="sm" className={DESTRUCTIVE_GHOST_CLASS} onClick={() => actions.onExclude(upload)}>
          {t("measurements.uploads.exclude.action")}
        </Button>
      ) : null}
      {canRestore ? (
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => actions.onRestore(upload)}>
          {t("common:actions.restore")}
        </Button>
      ) : null}
      {canExclude || canRestore ? null : <span aria-hidden="true" className="w-[4.375rem]" />}
      {upload.result === null ? <span aria-hidden="true" className="size-7" /> : <DetailsToggle upload={upload} />}
    </div>
  );
}

export const UPLOAD_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "receivedAt", size: 150, header: ReceivedHeader, cell: ReceivedCell }),
  columnHelper.display({ id: "contributor", size: 210, header: ContributorHeader, cell: ContributorCell }),
  columnHelper.display({ id: "device", size: 180, header: DeviceHeader, cell: DeviceCell }),
  columnHelper.display({ id: "status", size: 200, header: StatusHeader, cell: StatusCell }),
  columnHelper.display({ id: "samples", size: 180, header: SamplesHeader, cell: SamplesCell }),
  columnHelper.display({ id: "discoveries", size: 160, header: DiscoveriesHeader, cell: DiscoveriesCell }),
  columnHelper.display({ id: "size", size: 80, header: SizeHeader, cell: SizeCell }),
  columnHelper.display({ id: "fileExpiresAt", size: 120, header: FileHeader, cell: FileCell }),
  columnHelper.display({ id: "actions", size: 160, header: ActionsHeader, cell: ActionsCell }),
]);

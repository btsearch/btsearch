import { Alert02Icon, Cancel01Icon, Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { MeasurementRejectionReason, MeasurementUpload, MeasurementUploadStatus } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { StatusBadge } from "../settingsPrimitives";

type UploadStatusLook = { labelKey: string; tone: ComponentProps<typeof StatusBadge>["tone"]; icon?: IconSvgElement };

const UPLOAD_STATUS_LOOKS: Record<MeasurementUploadStatus, UploadStatusLook> = {
  received: { labelKey: "settings:measurements.uploads.statuses.received", tone: "muted", icon: Clock01Icon },
  processing: { labelKey: "settings:measurements.uploads.statuses.processing", tone: "primary" },
  processed: { labelKey: "settings:measurements.uploads.statuses.processed", tone: "success", icon: Tick02Icon },
  rejected: { labelKey: "common:status.rejected", tone: "warning", icon: Cancel01Icon },
  withdrawn: { labelKey: "settings:measurements.uploads.statuses.withdrawn", tone: "muted" },
  excluded: { labelKey: "settings:measurements.uploads.statuses.excluded", tone: "warning", icon: Alert02Icon },
};

export function getUploadStatusLabel(t: TFunction, status: MeasurementUploadStatus): string {
  return t(UPLOAD_STATUS_LOOKS[status].labelKey);
}

function readRejection(t: TFunction, reason: MeasurementRejectionReason, attempts: number): string {
  if (reason === "processingFailed") return t("settings:measurements.uploads.rejections.processingFailed", { count: attempts });
  return t(`settings:measurements.uploads.rejections.${reason}`);
}

export function readUploadStatusReason(t: TFunction, upload: Pick<MeasurementUpload, "rejectionReason" | "exclusion" | "attempts">): string | null {
  const { rejectionReason, exclusion } = upload;
  if (exclusion !== null) return t("settings:measurements.reason", { reason: exclusion.reason });
  if (rejectionReason !== null) return t("settings:measurements.reason", { reason: readRejection(t, rejectionReason, upload.attempts) });
  return null;
}

export function UploadStatusBadge({ status }: { status: MeasurementUploadStatus }) {
  const { t } = useTranslation(["settings", "common"]);
  const look = UPLOAD_STATUS_LOOKS[status];

  return (
    <StatusBadge tone={look.tone} icon={look.icon}>
      {t(look.labelKey)}
    </StatusBadge>
  );
}

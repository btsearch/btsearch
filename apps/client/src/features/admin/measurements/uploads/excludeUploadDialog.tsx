import type { MeasurementUpload } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateUploadQueries } from "../api/keys";
import { excludeUpload } from "../api/uploads";
import { ReasonDialog } from "../components/reasonDialog";
import { shortId } from "../utils/format";
import { showUploadError } from "@/features/settings/measurementErrors";
import { measurementDeviceName } from "@/features/settings/measurementQueries";
import { formatDateTime } from "@/lib/format";

type ExcludeUploadDialogProps = {
  upload: MeasurementUpload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ExcludeUploadDialog({ upload, open, onOpenChange }: ExcludeUploadDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();

  const excludeMutation = useMutation({
    mutationFn: ({ uploadId, reason }: { uploadId: string; reason: string }) => excludeUpload(uploadId, reason),
    onSuccess: () => {
      onOpenChange(false);
      toast.success(t("measurements.uploads.exclude.success"));
    },
    onError: showUploadError,
    onSettled: () => void invalidateUploadQueries(queryClient),
  });

  if (upload === null) return null;

  const deviceName = upload.device === undefined ? shortId(upload.deviceId) : measurementDeviceName(upload.device);

  return (
    <ReasonDialog
      open={open}
      title={t("measurements.uploads.exclude.title")}
      description={t("measurements.uploads.exclude.description", { date: formatDateTime(upload.receivedAt, i18n.language), device: deviceName })}
      hint={t("measurements.uploads.exclude.reasonHint")}
      confirmLabel={t("measurements.uploads.exclude.action")}
      isDestructive
      isPending={excludeMutation.isPending}
      onOpenChange={onOpenChange}
      onSubmit={(reason) => excludeMutation.mutate({ uploadId: upload.id, reason })}
    />
  );
}

import type { MeasurementUpload } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateUploadQueries } from "../api/keys";
import { restoreUpload } from "../api/uploads";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { showUploadError } from "@/features/settings/measurementErrors";

type RestoreUploadDialogProps = {
  upload: MeasurementUpload | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RestoreUploadDialog({ upload, open, onOpenChange }: RestoreUploadDialogProps) {
  const { t } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const restoreMutation = useMutation({
    mutationFn: restoreUpload,
    onSuccess: () => {
      onOpenChange(false);
      toast.success(t("measurements.uploads.restore.success"));
    },
    onError: showUploadError,
    onSettled: () => void invalidateUploadQueries(queryClient),
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!restoreMutation.isPending) onOpenChange(nextOpen);
      }}
      title={t("measurements.uploads.restore.title")}
      description={t("measurements.uploads.restore.description")}
      confirmLabel={t("common:actions.restore")}
      pending={restoreMutation.isPending}
      destructive={false}
      onConfirm={() => {
        if (upload !== null) restoreMutation.mutate(upload.id);
      }}
    />
  );
}

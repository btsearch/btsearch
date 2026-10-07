import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { type DeleteBlocker, DeleteRefusedDialog } from "./deleteRefusedDialog";
import { ConfirmDialog } from "./referenceCards";
import { isConflict } from "@/lib/api";

type RecordDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  deletedMessage: string;
  refusedTitle: string;
  deleteFailedKey: string;
  blockers?: readonly DeleteBlocker[];
  deleteRecord: () => Promise<void>;
  onDeleted: (queryClient: QueryClient) => unknown;
  describeRefusal?: (reason: string) => string;
};

type DeleteRefusal = {
  description: string;
  blockers?: readonly DeleteBlocker[];
};

export function RecordDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  deletedMessage,
  refusedTitle,
  deleteFailedKey,
  blockers,
  deleteRecord,
  onDeleted,
  describeRefusal,
}: RecordDeleteDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const [refusal, setRefusal] = useState<DeleteRefusal | null>(null);
  const [isRefusalOpen, setIsRefusalOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: deleteRecord,
    onSuccess: () => {
      onOpenChange(false);
      void onDeleted(queryClient);
      toast.success(deletedMessage);
    },
    onError: (error) => {
      if (!isConflict(error)) {
        showReferenceError(error, deleteFailedKey);
        return;
      }
      const reason = getReferenceErrorMessage(t, error, deleteFailedKey);
      onOpenChange(false);
      setRefusal({ description: describeRefusal === undefined ? reason : describeRefusal(reason), blockers });
      setIsRefusalOpen(true);
    },
  });

  return (
    <>
      <ConfirmDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!deleteMutation.isPending) onOpenChange(nextOpen);
        }}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
      <DeleteRefusedDialog
        open={isRefusalOpen}
        onOpenChange={setIsRefusalOpen}
        title={refusedTitle}
        description={refusal?.description ?? ""}
        blockers={refusal?.blockers}
      />
    </>
  );
}

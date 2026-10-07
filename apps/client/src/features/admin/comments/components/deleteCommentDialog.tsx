import type { Comment } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { isRepeatedClick } from "../mutations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DeleteCommentDialogProps = {
  comment: Comment | null;
  onConfirm: (comment: Comment) => void;
  onClose: () => void;
};

export function DeleteCommentDialog({ comment, onConfirm, onClose }: DeleteCommentDialogProps) {
  const { t } = useTranslation(["admin", "common"]);

  function confirmDelete(event: { detail: number }) {
    if (comment !== null && !isRepeatedClick(event)) onConfirm(comment);
  }

  return (
    <AlertDialog
      open={comment !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("comments.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("comments.deleteDesc")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">{t("common:actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" className="cursor-pointer" onClick={confirmDelete}>
            {t("common:actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

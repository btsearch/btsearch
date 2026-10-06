import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { ReviewNoteField } from "./reviewNoteField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type RejectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: string;
  onNoteChange: (note: string) => void;
  error: string | null;
  isBusy: boolean;
  onConfirm: () => void;
};

export function RejectDialog({ open, onOpenChange, note, onNoteChange, error, isBusy, onConfirm }: RejectDialogProps) {
  const { t } = useTranslation(["submissions", "common"]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader className="pr-7">
          <DialogTitle>{t("review.reject.title")}</DialogTitle>
          <DialogDescription>{t("review.reject.description")}</DialogDescription>
        </DialogHeader>
        <ReviewNoteField
          label={t("review.reject.noteLabel")}
          placeholder={t("review.reject.notePlaceholder")}
          value={note}
          onChange={onNoteChange}
          showsCount
        />
        {error === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" variant="destructive" className="cursor-pointer" disabled={isBusy} onClick={onConfirm}>
            {isBusy ? <Spinner /> : <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />}
            {t("review.reject.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type DeleteStationDialogProps = {
  isOpen: boolean;
  isPending: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
};

export function DeleteStationDialog({ isOpen, isPending, onOpenChange, onConfirm }: DeleteStationDialogProps) {
  const { t } = useTranslation(["stations", "common"]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader className="pr-7">
          <DialogTitle>{t("edit.editor.delete.title")}</DialogTitle>
          <DialogDescription>{t("edit.editor.delete.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" className="cursor-pointer" />}>{t("common:actions.cancel")}</DialogClose>
          <Button type="button" variant="destructive" className="cursor-pointer" disabled={isPending} onClick={onConfirm}>
            {isPending ? <Spinner /> : <HugeiconsIcon icon={Delete02Icon} aria-hidden="true" />}
            {t("header.deleteStation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

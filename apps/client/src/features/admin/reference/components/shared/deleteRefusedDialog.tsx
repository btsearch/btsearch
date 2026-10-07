import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DeleteBlocker = {
  label: string;
  value: string;
};

type DeleteRefusal = {
  title: ReactNode;
  description: ReactNode;
  blockers?: readonly DeleteBlocker[];
};

type DeleteRefusedDialogProps = DeleteRefusal & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DeleteRefusedDialog({ open, onOpenChange, title, description, blockers }: DeleteRefusedDialogProps) {
  const { t } = useTranslation("common");
  const [shown, setShown] = useState<DeleteRefusal>({ title, description, blockers });
  const isShownOutdated = shown.title !== title || shown.description !== description || shown.blockers !== blockers;
  if (open && isShownOutdated) setShown({ title, description, blockers });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-7">{shown.title}</DialogTitle>
          <DialogDescription>{shown.description}</DialogDescription>
        </DialogHeader>
        {shown.blockers !== undefined && shown.blockers.length > 0 ? (
          <dl className="divide-y rounded-lg border text-sm">
            {shown.blockers.map((blocker) => (
              <div key={blocker.label} className="flex items-center justify-between gap-3 px-3 py-2">
                <dt className="min-w-0">{blocker.label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">{blocker.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" className="cursor-pointer" />}>{t("actions.close")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

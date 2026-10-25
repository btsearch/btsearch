import { Fragment, type ReactNode } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";

type QueueDialogProps = {
  open: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function QueueDialog({ open, isPending, onOpenChange, children }: QueueDialogProps) {
  const openingCount = useOpeningCount(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <Fragment key={openingCount}>{children}</Fragment>
      </DialogContent>
    </Dialog>
  );
}

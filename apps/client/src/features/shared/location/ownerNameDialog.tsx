import { useTranslation } from "react-i18next";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { OwnerNameForm } from "@/features/admin/reference/components/owners/structureOwnerDialog";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";

export type OwnerNameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  title?: string;
  description?: string;
  submitLabel?: string;
  onSubmit: (name: string) => void;
};

export function OwnerNameDialog({ open, onOpenChange, initialName, title, description, submitLabel, onSubmit }: OwnerNameDialogProps) {
  const { t } = useTranslation();
  const openingCount = useOpeningCount(open);

  function handleSubmit(name: string) {
    onSubmit(name);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <OwnerNameForm
          key={openingCount}
          initialName={initialName}
          title={title ?? t("stations:edit.owner.proposeTitle")}
          description={description ?? t("stations:edit.owner.proposeDescription")}
          submitLabel={submitLabel ?? t("stations:edit.owner.proposeSubmit")}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

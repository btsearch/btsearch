import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type DialogFormFooterProps = {
  submitLabel: string;
  canSubmit: boolean;
  isPending: boolean;
  onCancel: () => void;
};

export function DialogFormFooter({ submitLabel, canSubmit, isPending, onCancel }: DialogFormFooterProps) {
  const { t } = useTranslation("common");

  return (
    <DialogFooter>
      <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
        {t("actions.cancel")}
      </Button>
      <Button type="submit" className="cursor-pointer" disabled={!canSubmit}>
        {isPending ? <Spinner /> : null}
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}

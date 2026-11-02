import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PendingApprovalNotice({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["auth", "common"]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("pendingApproval.title")}</DialogTitle>
        <DialogDescription>{t("pendingApproval.description")}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common:actions.close")}
        </Button>
      </DialogFooter>
    </>
  );
}

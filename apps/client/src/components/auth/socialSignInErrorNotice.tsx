import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PendingApprovalNotice } from "./pendingApprovalNotice";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PENDING_APPROVAL_CODE } from "@/lib/auth/errorCodes";
import { clearSocialSignInError, readSocialSignInError } from "@/lib/auth/socialSignInError";

const ERROR_TOAST_ID = "social-sign-in-error";

export function SocialSignInErrorNotice() {
  const { t } = useTranslation("auth");
  const [error] = useState(readSocialSignInError);
  const isPendingApproval = error?.code === PENDING_APPROVAL_CODE;
  const [isPendingNoticeOpen, setIsPendingNoticeOpen] = useState(isPendingApproval);

  useEffect(() => {
    if (error === null) return;

    clearSocialSignInError();
    if (error.code !== PENDING_APPROVAL_CODE) {
      toast.error(t("signIn.failed"), { id: ERROR_TOAST_ID, description: error.description ?? t("unexpectedError") });
    }
  }, [error, t]);

  if (!isPendingApproval) return null;

  return (
    <Dialog open={isPendingNoticeOpen} onOpenChange={setIsPendingNoticeOpen}>
      <DialogContent className="max-w-sm sm:max-w-md">
        <PendingApprovalNotice onClose={() => setIsPendingNoticeOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

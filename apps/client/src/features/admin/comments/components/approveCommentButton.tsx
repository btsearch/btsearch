import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ApproveCommentButtonProps = {
  onApprove: () => void;
  isBusy?: boolean;
  disabled?: boolean;
};

export function ApproveCommentButton({ onApprove, isBusy = false, disabled = false }: ApproveCommentButtonProps) {
  const { t } = useTranslation("common");

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="cursor-pointer data-disabled:cursor-default data-disabled:opacity-50"
      onClick={onApprove}
      disabled={disabled || isBusy}
      focusableWhenDisabled
    >
      {isBusy ? <Spinner className="size-3" /> : <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" />}
      {t("actions.approve")}
    </Button>
  );
}

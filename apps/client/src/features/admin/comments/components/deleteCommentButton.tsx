import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type DeleteCommentButtonProps = {
  onDelete: () => void;
  isBusy?: boolean;
  disabled?: boolean;
};

export function DeleteCommentButton({ onDelete, isBusy = false, disabled = false }: DeleteCommentButtonProps) {
  const { t } = useTranslation("admin");
  const label = t("comments.deleteTitle");

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="cursor-pointer text-muted-foreground hover:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50"
      aria-label={label}
      title={label}
      onClick={onDelete}
      disabled={disabled || isBusy}
      focusableWhenDisabled
    >
      {isBusy ? <Spinner className="size-4" /> : <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />}
    </Button>
  );
}

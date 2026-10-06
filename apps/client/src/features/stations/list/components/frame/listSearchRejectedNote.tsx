import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

export function ListSearchRejectedNote() {
  const { t } = useTranslation("main");

  return (
    <p className="flex items-start gap-2 pl-[13px] text-xs leading-4 font-medium text-foreground">
      <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0 text-destructive" aria-hidden="true" />
      <span className="min-w-0">{t("search.queryRejected")}</span>
    </p>
  );
}

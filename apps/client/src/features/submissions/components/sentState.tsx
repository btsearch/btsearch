import { ArrowUpRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

type SentStateProps = {
  onAgain: (() => void) | null;
};

export function SentState({ onAgain }: SentStateProps) {
  const { t } = useTranslation(["submissions", "nav"]);

  return (
    <div role="status" className="flex flex-col gap-2.5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {t("toast.submitted")}
      </p>
      <p className="text-xs text-muted-foreground">{t("form.sentDescription")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/account/submissions" />} className="cursor-pointer">
          {t("nav:items.mySubmissions")}
          <HugeiconsIcon icon={ArrowUpRight01Icon} aria-hidden="true" data-icon="inline-end" />
        </Button>
        {onAgain === null ? null : (
          <Button type="button" variant="outline" size="sm" onClick={onAgain} className="cursor-pointer">
            {t("form.sendAnother")}
          </Button>
        )}
      </div>
    </div>
  );
}

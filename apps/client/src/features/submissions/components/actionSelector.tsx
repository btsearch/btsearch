import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { StationAction } from "../types";

export interface ActionSelectorProps {
  action: StationAction;
  onActionChange: (action: StationAction) => void;
}

export function ActionSelector({ action, onActionChange }: ActionSelectorProps) {
  const { t } = useTranslation(["submissions", "common"]);

  return (
    <div
      className={cn(
        "border-2 rounded-xl px-4 py-2.5 flex items-center justify-between gap-4 transition-colors",
        action === "delete" ? "border-destructive/50 bg-destructive/[0.03]" : "border-primary/30 bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={action === "delete" ? Delete02Icon : PencilEdit02Icon}
          className={cn("size-4", action === "delete" ? "text-destructive" : "text-muted-foreground")}
        />
        <span className="font-semibold text-sm">{t("actionSelector.title")}</span>
      </div>
      <div className="flex items-center p-1 bg-muted/50 rounded-lg border shadow-sm">
        <button
          type="button"
          onClick={() => onActionChange("update")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            action === "update"
              ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50",
          )}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
          <span className="hidden sm:inline">{t("actionSelector.update")}</span>
        </button>
        <button
          type="button"
          onClick={() => onActionChange("delete")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            action === "delete"
              ? "bg-destructive/10 text-destructive shadow-sm ring-1 ring-destructive/20"
              : "text-muted-foreground hover:text-destructive hover:bg-destructive/5",
          )}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
          <span className="hidden sm:inline">{t("actionSelector.delete")}</span>
        </button>
      </div>
    </div>
  );
}

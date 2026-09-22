import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { StationAction } from "../types";
import { cn } from "@/lib/utils";

export interface ActionSelectorProps {
  action: StationAction;
  onActionChange: (action: StationAction) => void;
}

export function ActionSelector({ action, onActionChange }: ActionSelectorProps) {
  const { t } = useTranslation(["submissions", "common"]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-b-xl border-t bg-muted/30 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <HugeiconsIcon
          icon={action === "delete" ? Delete02Icon : PencilEdit02Icon}
          className={cn("size-4 shrink-0", action === "delete" ? "text-destructive" : "text-muted-foreground")}
          aria-hidden="true"
        />
        <span className="truncate text-sm font-semibold">{t("actionSelector.title")}</span>
      </div>
      <div className="flex shrink-0 items-center rounded-lg border bg-card p-0.5 shadow-sm">
        <button
          type="button"
          aria-label={t("actionSelector.update")}
          aria-pressed={action === "update"}
          onClick={() => onActionChange("update")}
          className={cn(
            "flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            action === "update"
              ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/50"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50",
          )}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
          <span className="hidden sm:inline">{t("actionSelector.update")}</span>
        </button>
        <button
          type="button"
          aria-label={t("actionSelector.delete")}
          aria-pressed={action === "delete"}
          onClick={() => onActionChange("delete")}
          className={cn(
            "flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-all focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            action === "delete"
              ? "bg-background text-foreground shadow-sm ring-1 ring-destructive/70"
              : "text-muted-foreground hover:text-foreground hover:bg-destructive/5",
          )}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3.5 text-destructive" />
          <span className="hidden sm:inline">{t("actionSelector.delete")}</span>
        </button>
      </div>
    </div>
  );
}

import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { StationAction } from "../types";
import { SegmentButton, SegmentSwitch } from "./segmentSwitch";
import { cn } from "@/lib/utils";

type ActionSelectorProps = {
  action: StationAction;
  isLocked: boolean;
  onActionChange: (action: StationAction) => void;
};

export function ActionSelector({ action, isLocked, onActionChange }: ActionSelectorProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const isDelete = action === "delete";

  return (
    <div className="flex items-center justify-between gap-3 rounded-b-xl border-t bg-muted/30 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <HugeiconsIcon
          icon={isDelete ? Delete02Icon : PencilEdit02Icon}
          className={cn("size-4 shrink-0", isDelete ? "text-destructive" : "text-muted-foreground")}
          aria-hidden="true"
        />
        <span className="truncate text-sm font-semibold">{t("actionSelector.title")}</span>
      </div>
      <SegmentSwitch label={t("actionSelector.title")}>
        <SegmentButton
          label={t("common:submissionType.update")}
          icon={PencilEdit02Icon}
          isActive={!isDelete}
          isDisabled={isLocked}
          onClick={() => onActionChange("update")}
        />
        <SegmentButton
          label={t("common:submissionType.delete")}
          icon={Delete02Icon}
          isActive={isDelete}
          isDisabled={isLocked}
          isDestructive
          onClick={() => onActionChange("delete")}
        />
      </SegmentSwitch>
    </div>
  );
}

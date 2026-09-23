import {
  Activity01Icon,
  Add01Icon,
  Cancel01Icon,
  CleanIcon,
  DatabaseImportIcon,
  Delete02Icon,
  Image01Icon,
  MagicWand01Icon,
  PencilEdit02Icon,
  Tick02Icon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { AuditOperationKind } from "@openbts/shared/audit";
import type { TFunction } from "i18next";

import { getKindLabel } from "../labels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ActionBadgeStyle = {
  icon: IconSvgElement;
  className: string;
};

const ACTION_BADGE_STYLES: Record<string, ActionBadgeStyle> = {
  create: {
    icon: Add01Icon,
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  edit: {
    icon: PencilEdit02Icon,
    className: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  update: {
    icon: PencilEdit02Icon,
    className: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  delete: {
    icon: Delete02Icon,
    className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  approve: {
    icon: Tick02Icon,
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  photos: {
    icon: Image01Icon,
    className: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  reject: {
    icon: Cancel01Icon,
    className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  cleanup: {
    icon: CleanIcon,
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  inactive_cleanup: {
    icon: CleanIcon,
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  submission_cleanup: {
    icon: CleanIcon,
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  import: {
    icon: DatabaseImportIcon,
    className: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  apply: {
    icon: MagicWand01Icon,
    className: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  revert: {
    icon: Undo02Icon,
    className: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
};

const FALLBACK_ACTION_BADGE_STYLE: ActionBadgeStyle = {
  icon: Activity01Icon,
  className: "border-border bg-muted/50 text-muted-foreground",
};

type OperationKindBadgeProps = {
  kind: AuditOperationKind;
  t: TFunction;
  compact?: boolean;
  className?: string;
};

export function OperationKindBadge({ kind, t, compact = false, className }: OperationKindBadgeProps) {
  const action = kind.split(".").pop() ?? "";
  const style = ACTION_BADGE_STYLES[action] ?? FALLBACK_ACTION_BADGE_STYLE;

  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 rounded-md font-medium", compact ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs", style.className, className)}
    >
      <HugeiconsIcon icon={style.icon} data-icon="inline-start" strokeWidth={2} aria-hidden />
      {getKindLabel(t, kind)}
    </Badge>
  );
}

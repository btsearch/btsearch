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

const EMERALD_BADGE_CLASS = "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
const BLUE_BADGE_CLASS = "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300";
const ROSE_BADGE_CLASS = "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
const SKY_BADGE_CLASS = "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
const AMBER_BADGE_CLASS = "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
const VIOLET_BADGE_CLASS = "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300";

const CHANGE_BADGE_STYLE: ActionBadgeStyle = { icon: PencilEdit02Icon, className: BLUE_BADGE_CLASS };
const ALLOW_BADGE_STYLE: ActionBadgeStyle = { icon: Tick02Icon, className: EMERALD_BADGE_CLASS };
const REFUSE_BADGE_STYLE: ActionBadgeStyle = { icon: Cancel01Icon, className: ROSE_BADGE_CLASS };
const CLEANUP_BADGE_STYLE: ActionBadgeStyle = { icon: CleanIcon, className: AMBER_BADGE_CLASS };

const ACTION_BADGE_STYLES: Record<string, ActionBadgeStyle> = {
  create: { icon: Add01Icon, className: EMERALD_BADGE_CLASS },
  edit: CHANGE_BADGE_STYLE,
  update: CHANGE_BADGE_STYLE,
  delete: { icon: Delete02Icon, className: ROSE_BADGE_CLASS },
  approve: ALLOW_BADGE_STYLE,
  photos: { icon: Image01Icon, className: SKY_BADGE_CLASS },
  reject: REFUSE_BADGE_STYLE,
  bands: CHANGE_BADGE_STYLE,
  role: CHANGE_BADGE_STYLE,
  email: CHANGE_BADGE_STYLE,
  password: CHANGE_BADGE_STYLE,
  ban: REFUSE_BADGE_STYLE,
  unban: ALLOW_BADGE_STYLE,
  cleanup: CLEANUP_BADGE_STYLE,
  inactive_cleanup: CLEANUP_BADGE_STYLE,
  submission_cleanup: CLEANUP_BADGE_STYLE,
  import: { icon: DatabaseImportIcon, className: VIOLET_BADGE_CLASS },
  apply: { icon: MagicWand01Icon, className: VIOLET_BADGE_CLASS },
  revert: { icon: Undo02Icon, className: VIOLET_BADGE_CLASS },
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

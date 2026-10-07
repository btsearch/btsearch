import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatusStripTone = "warning" | "danger" | "success";

type StatusStripProps = {
  tone: StatusStripTone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconSvgElement;
};

const TONE_CLASSES: Record<StatusStripTone, string> = {
  warning: "border-yellow-600/30 bg-yellow-300/15 text-yellow-800 dark:border-yellow-400/30 dark:bg-yellow-400/12 dark:text-yellow-300",
  danger: "border-red-600/30 bg-red-500/10 text-red-700 dark:border-red-400/35 dark:bg-red-400/12 dark:text-red-300",
  success: "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
};

export function StatusStrip({ tone, title, children, action, icon = Alert02Icon }: StatusStripProps) {
  return (
    <div role="status" className={cn("flex shrink-0 items-center gap-2.5 border-b px-4 py-2 text-sm", TONE_CLASSES[tone])}>
      <HugeiconsIcon icon={icon} aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{title}</span>
        {children === undefined || children === null ? null : <> - {children}</>}
      </p>
      {action}
    </div>
  );
}

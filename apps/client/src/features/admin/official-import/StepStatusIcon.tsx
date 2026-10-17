import { AlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon, Clock01Icon, MinusSignCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import type { StepStatus } from "./runs";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const STEP_ICON: Record<StepStatus, { icon: IconSvgElement | null; className: string }> = {
  success: { icon: CheckmarkCircle02Icon, className: "text-emerald-600 dark:text-emerald-500" },
  error: { icon: Cancel01Icon, className: "text-destructive" },
  held: { icon: AlertCircleIcon, className: "text-amber-700 dark:text-amber-400" },
  running: { icon: null, className: "text-primary" },
  pending: { icon: Clock01Icon, className: "text-muted-foreground/70" },
  unchanged: { icon: MinusSignCircleIcon, className: "text-muted-foreground/70" },
  skipped: { icon: MinusSignCircleIcon, className: "text-muted-foreground/70" },
  stopped: { icon: MinusSignCircleIcon, className: "text-muted-foreground/70" },
};

export function StepStatusIcon({ status, className }: { status: StepStatus; className?: string }) {
  const { icon, className: toneClassName } = STEP_ICON[status];
  if (!icon) return <Spinner className={cn("shrink-0", toneClassName, className)} aria-hidden="true" />;
  return <HugeiconsIcon icon={icon} className={cn("shrink-0", toneClassName, className)} aria-hidden="true" />;
}

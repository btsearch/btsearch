import { Cancel01Icon, Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { SubmissionRowStatus } from "@/features/admin/submissions/types";
import { cn } from "@/lib/utils";

type SubmissionStatus = SubmissionRowStatus;

const SUBMISSION_STATUS_BADGE = {
  pending: {
    icon: Clock01Icon,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  approved: {
    icon: Tick02Icon,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    icon: Cancel01Icon,
    className: "bg-red-500/10 text-red-700 dark:text-red-400",
    iconClassName: "text-red-600 dark:text-red-400",
  },
} satisfies Record<SubmissionStatus, { icon: IconSvgElement; className: string; iconClassName: string }>;

type SubmissionStatusBadgeProps = {
  status: SubmissionStatus;
  compact?: boolean;
  className?: string;
};

export function SubmissionStatusBadge({ status, compact = false, className }: SubmissionStatusBadgeProps) {
  const { t } = useTranslation("common");
  const config = SUBMISSION_STATUS_BADGE[status];
  const label = t(`status.${status}`);

  if (compact) {
    return <HugeiconsIcon icon={config.icon} className={cn("size-3.5 shrink-0", config.iconClassName, className)} role="img" aria-label={label} />;
  }

  return (
    <span
      className={cn(
        "flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium",
        config.className,
        className,
      )}
    >
      <HugeiconsIcon icon={config.icon} className={cn("size-3.5", config.iconClassName)} aria-hidden="true" />
      {label}
    </span>
  );
}

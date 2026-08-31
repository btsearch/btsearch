import { Add01Icon, Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { SubmissionFormData } from "../types";

type SubmissionType = SubmissionFormData["type"];

const SUBMISSION_TYPE_BADGE = {
  new: {
    icon: Add01Icon,
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  update: {
    icon: PencilEdit02Icon,
    className: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  delete: {
    icon: Delete02Icon,
    className: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
} satisfies Record<SubmissionType, { icon: IconSvgElement; className: string }>;

type SubmissionTypeBadgeProps = {
  type: SubmissionType;
  className?: string;
};

export function SubmissionTypeBadge({ type, className }: SubmissionTypeBadgeProps) {
  const { t } = useTranslation("common");
  const config = SUBMISSION_TYPE_BADGE[type];

  return (
    <Badge variant="outline" className={cn("h-6 rounded-md px-2 text-xs font-medium", config.className, className)}>
      <HugeiconsIcon icon={config.icon} data-icon="inline-start" strokeWidth={2} aria-hidden />
      {t(`submissionType.${type}`)}
    </Badge>
  );
}

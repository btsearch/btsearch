import { Alert02Icon, UserBlock01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { formatWeight } from "../utils/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

const LOW_WEIGHT_THRESHOLD = 0.3;

export const LOW_WEIGHT_TEXT_CLASS = "text-amber-700 dark:text-amber-400";

export function isLowWeight(weight: number): boolean {
  return weight < LOW_WEIGHT_THRESHOLD;
}

export function LowWeightMark({ className }: { className?: string }) {
  const { t, i18n } = useTranslation("admin");
  const label = t("measurements.contributors.lowWeight", { weight: LOW_WEIGHT_THRESHOLD.toLocaleString(i18n.language) });

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
        <HugeiconsIcon icon={Alert02Icon} role="img" aria-label={label} className={cn("size-3.5", className)} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function VouchBadge({ weight }: { weight: number }) {
  const { t, i18n } = useTranslation("admin");

  return (
    <StatusBadge tone="primary" icon={UserCheck01Icon}>
      {t("measurements.contributors.vouchBadge", { weight: formatWeight(weight, i18n.language) })}
    </StatusBadge>
  );
}

export function BlockBadge({ children }: { children: ReactNode }) {
  return (
    <StatusBadge tone="destructive" icon={UserBlock01Icon}>
      {children}
    </StatusBadge>
  );
}

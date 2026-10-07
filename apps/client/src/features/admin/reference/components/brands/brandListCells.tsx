import { Alert02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import type { BrandLogo } from "../../types";
import { StatusBadge } from "../shared/referenceCards";
import { formatLogoInfo } from "./brandLogo";
import type { BrandUsage } from "./useBrandListRows";
import { EmptyValue } from "@/components/ui/emptyValue";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SHOWN_USAGE_NAMES = 2;
const WARNING_BADGE_CLASS = "text-amber-700 dark:text-amber-400";

export function BrandColorValue({ color, className }: { color: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 font-mono text-[0.8125rem] leading-5", className)}>
      <span aria-hidden="true" style={{ backgroundColor: color }} className="size-4 shrink-0 rounded-[4px] ring-1 ring-foreground/15 ring-inset" />
      {color}
    </span>
  );
}

export function BrandLogoInfo({ logo }: { logo: BrandLogo | null }) {
  const { t } = useTranslation("admin");

  if (logo !== null) return <span className="whitespace-nowrap text-muted-foreground">{formatLogoInfo(logo)}</span>;

  return (
    <StatusBadge tone="warning" icon={Alert02Icon} className={WARNING_BADGE_CLASS}>
      {t("reference.brands.list.noLogo")}
    </StatusBadge>
  );
}

export function BrandUsageNames({ usage }: { usage: BrandUsage }) {
  if (usage.state === "loading") return <Skeleton className="h-4 w-24" />;
  if (usage.state === "failed" || usage.value.length === 0) return <EmptyValue />;

  const names = usage.value;
  const shownNames = names.slice(0, SHOWN_USAGE_NAMES).join(", ");
  const hiddenNames = names.slice(SHOWN_USAGE_NAMES);
  if (hiddenNames.length === 0) return <span className="block truncate">{shownNames}</span>;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="flex min-w-0 items-center gap-1.5" />}>
        <span className="truncate">{shownNames}</span>
        <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground tabular-nums">
          +{hiddenNames.length}
        </span>
        <span className="sr-only">{hiddenNames.join(", ")}</span>
      </TooltipTrigger>
      <TooltipContent>{names.join(", ")}</TooltipContent>
    </Tooltip>
  );
}

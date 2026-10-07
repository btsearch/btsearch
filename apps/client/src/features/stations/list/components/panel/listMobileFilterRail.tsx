import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { MobileFilterChip } from "@/components/ui/mobile-filter-chip";
import { cn } from "@/lib/utils";

type ListMobileFilterRailProps = {
  isClearChipShown: boolean;
  onClearFilters: () => void;
  children: ReactNode;
};

type ListMobileFilterChipProps = {
  icon: IconSvgElement;
  label: string;
  count: number;
  onOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
};

const CLEAR_CHIP_RELEASE_DELAY_MS = 300;
const CLEAR_CHIP_CLASS = cn(
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background pr-3 pl-2 text-xs font-medium text-foreground",
  "outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
);
const CHIP_CONTENT_CLASS = "[&_button]:cursor-pointer";

export function useHeldClearChip(hasActiveFilters: boolean) {
  const [heldVisibility, setHeldVisibility] = useState<boolean | null>(null);
  const releaseTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(releaseTimerRef.current), []);

  function handleChipOpenChange(isOpen: boolean) {
    window.clearTimeout(releaseTimerRef.current);
    if (isOpen) setHeldVisibility((heldBefore) => heldBefore ?? hasActiveFilters);
    else releaseTimerRef.current = window.setTimeout(() => setHeldVisibility(null), CLEAR_CHIP_RELEASE_DELAY_MS);
  }

  return { isClearChipShown: heldVisibility ?? hasActiveFilters, handleChipOpenChange };
}

export function ListMobileFilterRail({ isClearChipShown, onClearFilters, children }: ListMobileFilterRailProps) {
  const { t } = useTranslation("common");

  return (
    <div role="group" aria-label={t("labels.filters")} className="flex items-center gap-1.5 [&_button]:cursor-pointer">
      {isClearChipShown ? (
        <button type="button" onClick={onClearFilters} className={CLEAR_CHIP_CLASS}>
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden="true" />
          {t("actions.clear")}
        </button>
      ) : null}
      {children}
    </div>
  );
}

export function ListMobileFilterChip({ icon, label, count, onOpenChange, children }: ListMobileFilterChipProps) {
  return (
    <MobileFilterChip active={count > 0} count={count} icon={icon} label={label} contentClassName={CHIP_CONTENT_CLASS} onOpenChange={onOpenChange}>
      {children}
    </MobileFilterChip>
  );
}

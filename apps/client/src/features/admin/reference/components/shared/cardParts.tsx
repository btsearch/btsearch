import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ReferenceRowError, ReferenceRowSkeleton, StatusBadge, TINTED_BUTTON_CLASS } from "./referenceCards";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

type CardAddButtonProps = {
  label: string;
  onClick: () => void;
  variant?: "tinted" | "outline";
  isCompactOnPhones?: boolean;
  disabled?: boolean;
};

type CardLoadStateProps = {
  hasLoadFailed: boolean;
  errorTitle: string;
  isRetrying: boolean;
  onRetry: () => void;
  skeletonRowCount: number;
};

const TINTED_ADD_BUTTON_CLASS = cn("cursor-pointer", TINTED_BUTTON_CLASS);

export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <StatusBadge tone="muted" className="font-semibold tabular-nums">
      {children}
    </StatusBadge>
  );
}

export function CardAddButton({ label, onClick, variant = "tinted", isCompactOnPhones = false, disabled = false }: CardAddButtonProps) {
  const { t } = useTranslation("admin");
  const isMobile = useIsMobile();
  const isTinted = variant === "tinted";
  const isCompact = isCompactOnPhones && isMobile;

  return (
    <Button
      type="button"
      variant={isTinted ? "ghost" : "outline"}
      size="sm"
      aria-label={isCompact ? label : undefined}
      className={isTinted ? TINTED_ADD_BUTTON_CLASS : "cursor-pointer"}
      disabled={disabled}
      onClick={onClick}
    >
      <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
      {isCompact ? t("users.detail.grants.add") : label}
    </Button>
  );
}

export function CardLoadState({ hasLoadFailed, errorTitle, isRetrying, onRetry, skeletonRowCount }: CardLoadStateProps) {
  return (
    <div className="border-t">
      {hasLoadFailed ? (
        <ReferenceRowError title={errorTitle} onRetry={onRetry} isRetrying={isRetrying} />
      ) : (
        Array.from({ length: skeletonRowCount }, (_, rowIndex) => <ReferenceRowSkeleton key={rowIndex} />)
      )}
    </div>
  );
}

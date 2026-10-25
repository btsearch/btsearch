import { AlertCircleIcon, Clock01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { EngineRunState } from "./engineRuns";
import { StatusBadge } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type EngineFactProps = {
  label: ReactNode;
  valueClassName?: string;
  children: ReactNode;
};

type EngineCardFooterProps = {
  note: ReactNode;
  children?: ReactNode;
};

type RunStateLook = { tone: ComponentProps<typeof StatusBadge>["tone"]; icon?: IconSvgElement };

const RUN_STATE_LOOKS: Record<EngineRunState, RunStateLook> = {
  queued: { tone: "muted", icon: Clock01Icon },
  running: { tone: "primary" },
  done: { tone: "success", icon: Tick02Icon },
  failed: { tone: "destructive", icon: AlertCircleIcon },
  cancelled: { tone: "muted" },
};

export function EngineFacts({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cn("pt-[5px] pb-2.5", className)}>{children}</dl>;
}

export function EngineFact({ label, valueClassName, children }: EngineFactProps) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-[7px]">
      <dt className="text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-sm font-semibold tabular-nums", valueClassName)}>{children}</dd>
    </div>
  );
}

export function EngineCardFooter({ note, children }: EngineCardFooterProps) {
  return (
    <div className="mt-auto flex min-h-11 shrink-0 items-center justify-between gap-2 border-t bg-muted/50 py-1.5 pr-2 pl-4">
      <span className="min-w-0 text-xs text-muted-foreground">{note}</span>
      {children}
    </div>
  );
}

export function EngineRunStateBadge({ state }: { state: EngineRunState }) {
  const { t } = useTranslation("admin");
  const look = RUN_STATE_LOOKS[state];

  return (
    <StatusBadge tone={look.tone} icon={look.icon}>
      {t(`measurements.engine.runStates.${state}`)}
    </StatusBadge>
  );
}

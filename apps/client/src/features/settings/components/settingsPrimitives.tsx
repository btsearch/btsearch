import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const SETTINGS_DESCRIPTION_CLASS = "text-[0.8125rem] leading-[1.125rem] text-muted-foreground";

export const SETTINGS_TWO_COLUMN_CLASS = "grid items-start gap-4 @4xl:grid-cols-2";

export const SETTINGS_INLINE_FORM_CLASS = "flex flex-col gap-3 px-4 pb-4 sm:pr-5 sm:pl-[4.125rem]";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function scrollToSettingsSection(id: string) {
  const behavior = window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
}

export function SettingsSection({
  id,
  title,
  badge,
  children,
  className,
}: {
  id: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn("scroll-mt-4", className)}>
      <div className="mb-4 flex items-center gap-3">
        <h2 id={`${id}-heading`} className="shrink-0 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {title}
        </h2>
        {badge}
        <div aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  );
}

export function SettingsStack({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex min-w-0 flex-col gap-4", className)}>{children}</div>;
}

export function SettingsCard({ tone = "default", className, ...props }: ComponentProps<"div"> & { tone?: "default" | "destructive" }) {
  return <Card className={cn("gap-0 py-0", tone === "destructive" && "ring-destructive/30", className)} {...props} />;
}

export function SettingsIconTile({
  icon,
  tone = "default",
  className,
}: {
  icon: IconSvgElement;
  tone?: "default" | "destructive";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
        tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={icon} />
    </div>
  );
}

export function SettingsCardHeader({
  icon,
  iconTone,
  title,
  titleId,
  description,
  badge,
  action,
  className,
}: {
  icon?: IconSvgElement;
  iconTone?: "default" | "destructive";
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3.5 px-4 py-3.5 sm:px-5 sm:py-4", className)}>
      {icon ? <SettingsIconTile icon={icon} tone={iconTone} /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={titleId} className="text-sm leading-5 font-semibold">
            {title}
          </h3>
          {badge}
        </div>
        {description ? <div className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{description}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{action}</div> : null}
    </div>
  );
}

export function SettingsRow({
  icon,
  iconTone,
  media,
  title,
  titleId,
  description,
  badge,
  wrap = false,
  className,
  children,
}: {
  icon?: IconSvgElement;
  iconTone?: "default" | "destructive";
  media?: ReactNode;
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  badge?: ReactNode;
  wrap?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-x-3.5 gap-y-3 border-t px-4 py-3.5 first:border-t-0 sm:px-5", wrap && "flex-wrap", className)}>
      {icon ? <SettingsIconTile icon={icon} tone={iconTone} /> : media}
      <div className={cn("min-w-0 flex-1", wrap && "basis-56")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p id={titleId} className="text-sm leading-5 font-medium">
            {title}
          </p>
          {badge}
        </div>
        {description ? <div className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{description}</div> : null}
      </div>
      {children ? <div className={cn("flex shrink-0 items-center gap-1.5", wrap && "max-sm:w-full")}>{children}</div> : null}
    </div>
  );
}

export function SettingsMeta({ children }: { children: ReactNode }) {
  return (
    <span className="block overflow-x-clip">
      <span className="-ml-3 flex flex-wrap">{children}</span>
    </span>
  );
}

export function SettingsMetaItem({ children }: { children: ReactNode }) {
  return (
    <span className="relative pl-3 wrap-anywhere">
      <span aria-hidden="true" className="absolute top-0 left-0 w-3 text-center text-muted-foreground/40">
        ·
      </span>
      {children}
    </span>
  );
}

export function SettingsRowSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3.5 border-t px-4 py-3.5 first:border-t-0 sm:px-5">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-44 max-w-full" />
      </div>
      <Skeleton className="h-7 w-20 shrink-0 rounded-lg" />
    </div>
  );
}

export function SettingsRowError({ title, onRetry, isRetrying }: { title: string; onRetry: () => void; isRetrying: boolean }) {
  return (
    <div className="border-t px-4 py-3 first:border-t-0 sm:px-5">
      <InlineError size="sm" title={title} onRetry={onRetry} isRetrying={isRetrying} />
    </div>
  );
}

export function SettingsCardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t bg-muted/50 px-4 py-3 sm:px-5", className)}>
      {children}
    </div>
  );
}

export function SettingsCardNote({
  icon = InformationCircleIcon,
  className,
  children,
}: {
  icon?: IconSvgElement;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-2 border-t bg-muted/50 px-4 py-2.5 text-xs leading-4 text-muted-foreground sm:px-5", className)}>
      <HugeiconsIcon icon={icon} aria-hidden="true" className="size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const STATUS_BADGE_TONES = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  primary: "bg-primary/10 text-primary",
  muted: "bg-muted text-muted-foreground",
} as const;

export function StatusBadge({
  tone,
  icon,
  className,
  children,
}: {
  tone: keyof typeof STATUS_BADGE_TONES;
  icon?: IconSvgElement;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_BADGE_TONES[tone], className)}>
      {icon ? <HugeiconsIcon icon={icon} data-icon="inline-start" /> : null}
      {children}
    </Badge>
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconSvgElement;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  ariaLabelledBy,
  disabled,
  className,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onValueChange(option.value);
      }}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn("inline-flex h-8 max-w-full items-center gap-0.5 rounded-lg bg-muted p-[3px] max-sm:w-full", className)}
    >
      {options.map((option) => (
        <RadioPrimitive.Root
          key={option.value}
          value={option.value}
          className="inline-flex h-full min-w-0 flex-[0_1_auto] cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-background data-checked:text-foreground data-checked:shadow-sm data-disabled:cursor-not-allowed data-disabled:opacity-50 max-sm:flex-auto dark:data-checked:border-input dark:data-checked:bg-input/30"
        >
          {option.icon ? <HugeiconsIcon icon={option.icon} aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          <span className="truncate">{option.label}</span>
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}

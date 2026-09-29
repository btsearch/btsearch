import { Database02Icon, File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { DialogOperatorName } from "./dialogOperatorName";
import { StationDialogActionBar } from "./stationDialogActionBar";
import { CloseButton } from "@/components/ui/close-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FloatingDialogPanelFrameProps } from "@/features/floating-dialogs/types";
import { getOperatorColor, getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

const SOURCE_SWITCH_DURATION_MS = 200;

const ENTER_FROM_CLASS_NAMES = {
  left: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-3 motion-safe:duration-200",
  right: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-3 motion-safe:duration-200",
} as const;

const STATION_SOURCE_OPTIONS = [
  {
    source: "internal",
    labelKey: "dialog.sourceDatabase",
    icon: Database02Icon,
    indicatorClassName: "translate-x-0 bg-emerald-700",
    hoverClassName: "hover:text-emerald-700 dark:hover:text-emerald-400",
  },
  {
    source: "uke",
    labelKey: "dialog.sourceUke",
    icon: File02Icon,
    indicatorClassName: "translate-x-full bg-violet-600",
    hoverClassName: "hover:text-violet-600 dark:hover:text-violet-400",
  },
] as const;

type StationDialogShellProps = FloatingDialogPanelFrameProps & {
  operatorMnc?: number | null;
  heading: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  sourceSwitch?: ReactNode;
  banners?: ReactNode;
  aside?: ReactNode;
  enterFrom?: keyof typeof ENTER_FROM_CLASS_NAMES;
  children: ReactNode;
};

export function StationDialogShell({
  operatorMnc,
  heading,
  actions,
  toolbar,
  sourceSwitch,
  banners,
  aside,
  enterFrom,
  children,
  onClose,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: StationDialogShellProps) {
  const operatorColor = typeof operatorMnc === "number" ? getOperatorColor(operatorMnc) : "#3b82f6";
  const enterClassName = enterFrom ? ENTER_FROM_CLASS_NAMES[enterFrom] : undefined;

  return (
    <div className={cn("relative", className)} style={style}>
      <div
        ref={contentRef}
        className={cn(
          "relative bg-background rounded-2xl shadow-2xl w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden",
          contentClassName,
        )}
      >
        <div {...headerDragProps} className={cn("shrink-0 bg-background/95 backdrop-blur-sm border-b", headerDragProps?.className)}>
          <div className="relative px-4 py-3 sm:px-6 sm:py-3.5" style={{ backgroundImage: getOperatorHeaderTintGradient(operatorColor) }}>
            <div className="flex items-start gap-3">
              <div className={cn("flex-1 min-w-0", enterClassName)}>{heading}</div>
              <div className="absolute top-2 right-2 flex shrink-0 items-center gap-0.5 sm:static sm:-mt-1 sm:-mr-2">
                {actions}
                <CloseButton onClick={onClose} onPointerDown={(event) => event.stopPropagation()} />
              </div>
            </div>
            {toolbar || sourceSwitch ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {toolbar ? <StationDialogActionBar className={enterClassName}>{toolbar}</StationDialogActionBar> : null}
                {sourceSwitch ? <div className="-mr-2 ml-auto">{sourceSwitch}</div> : null}
              </div>
            ) : null}
          </div>
          {banners}
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable">
          <div ref={bodyContentRef} className={enterClassName}>
            {children}
          </div>
        </div>
      </div>
      {aside}
    </div>
  );
}

type StationDialogHeadingProps = {
  operatorName: string;
  operatorMnc?: number | null;
  stationCode: string;
  badges?: ReactNode;
  location?: { city: string | null; address: string | null } | null;
  status?: ReactNode;
  createdAt?: string;
  updatedAt?: string;
};

export function StationDialogHeading({
  operatorName,
  operatorMnc,
  stationCode,
  badges,
  location,
  status,
  createdAt,
  updatedAt,
}: StationDialogHeadingProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { t: tCommon } = useTranslation("common");

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pr-28 sm:pr-0">
        <DialogOperatorName name={operatorName} mnc={operatorMnc} />
        <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{stationCode}</span>
        {badges}
      </div>
      {location ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{location.city}</p>
            {status}
          </div>
          <p className="text-xs leading-4 text-muted-foreground">{location.address || t("dialog.btsStation")}</p>
        </>
      ) : null}
      {createdAt && updatedAt ? (
        <div className="flex flex-col items-start pt-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <Tooltip>
            <TooltipTrigger className="cursor-default whitespace-nowrap text-[11px] leading-4 text-muted-foreground/80">
              {tCommon("labels.created")}: {formatRelativeTime(createdAt, tCommon)}
            </TooltipTrigger>
            <TooltipContent>{formatFullDate(createdAt, i18n.language)}</TooltipContent>
          </Tooltip>
          <span className="hidden text-[11px] leading-4 text-muted-foreground/40 sm:inline">·</span>
          <time
            dateTime={updatedAt}
            title={formatFullDate(updatedAt, i18n.language)}
            className="whitespace-nowrap text-[11px] leading-4 text-muted-foreground/80"
          >
            {tCommon("labels.updated")}: {formatRelativeTime(updatedAt, tCommon)}
          </time>
        </div>
      ) : null}
    </div>
  );
}

type StationSourceSwitchProps = {
  source: StationSource;
  onSwitch: () => void;
  onPrefetch?: () => void;
};

export function StationSourceSwitch({ source, onSwitch, onPrefetch }: StationSourceSwitchProps) {
  const { t } = useTranslation("stationDetails");
  const reduceMotion = useReducedMotion() === true;
  const [selected, setSelected] = useState(source);
  const switchSource = useEffectEvent(onSwitch);

  useEffect(() => {
    if (selected === source) return;
    const timeoutId = window.setTimeout(() => switchSource(), reduceMotion ? 0 : SOURCE_SWITCH_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [reduceMotion, selected, source]);

  const selectedOption = STATION_SOURCE_OPTIONS.find((option) => option.source === selected) ?? STATION_SOURCE_OPTIONS[0];

  return (
    <div
      role="group"
      aria-label={t("main:filters.dataSource")}
      className="relative grid shrink-0 grid-cols-2 rounded-lg bg-background/60 p-0.5 ring-1 ring-inset ring-border/70"
    >
      <span
        aria-hidden="true"
        style={{ transitionDuration: `${SOURCE_SWITCH_DURATION_MS}ms` }}
        className={cn(
          "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md shadow-sm transition-[translate,background-color] ease-out motion-reduce:transition-none",
          selectedOption.indicatorClassName,
        )}
      />
      {STATION_SOURCE_OPTIONS.map((option) => {
        const isSelected = option.source === selected;
        return (
          <button
            key={option.source}
            type="button"
            aria-pressed={isSelected}
            onPointerEnter={isSelected ? undefined : onPrefetch}
            onFocus={isSelected ? undefined : onPrefetch}
            onClick={isSelected ? undefined : () => setSelected(option.source)}
            className={cn(
              "relative flex h-5 items-center justify-center gap-1 px-2 text-[11px] font-semibold leading-none transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              isSelected ? "cursor-default text-white" : cn("cursor-pointer text-muted-foreground", option.hoverClassName),
            )}
          >
            <HugeiconsIcon icon={option.icon} className="size-3" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StationDialogHeadingSkeleton() {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex h-5 items-center gap-2 pr-28 sm:pr-0">
        <Skeleton className="h-5 w-8 rounded-[2px]" />
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="h-3 w-14 rounded" />
      </div>
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-28 rounded" />
      </div>
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-48 max-w-full rounded" />
      </div>
      <div className="flex flex-col items-start pt-0.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex h-4 items-center">
          <Skeleton className="h-2.5 w-24 rounded" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-2.5 w-28 rounded" />
        </div>
      </div>
    </div>
  );
}

export function StationDialogToolbarSkeleton() {
  return (
    <>
      <Skeleton className="h-6 w-16" />
      <Skeleton className="size-6 md:w-24" />
      <Skeleton className="size-6 md:w-24" />
    </>
  );
}

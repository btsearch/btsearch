import { AlertCircleIcon, ArrowDown01Icon, InformationCircleIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type ReactNode, useContext } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { PageContentContext } from "@/contexts/pageContent";
import { cn } from "@/lib/utils";

type RetryProps = {
  onRetry?: () => unknown;
  isRetrying?: boolean;
  retryLabel?: string;
};

export type ErrorStateProps = RetryProps & {
  title?: ReactNode;
  description?: ReactNode;
  icon?: IconSvgElement;
  tone?: "destructive" | "neutral";
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export type InlineErrorProps = RetryProps & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: "default" | "sm";
  className?: string;
};

export type StaleDataNoticeProps = Omit<RetryProps, "retryLabel"> & {
  message?: ReactNode;
  className?: string;
};

type SignalStatus = "none" | "unstable" | "barred" | "noService";

export type PageErrorStateProps = ErrorStateProps & {
  signal?: SignalStatus;
};

type RetryButtonProps = {
  onRetry: () => unknown;
  isRetrying: boolean;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "xs";
};

function RetryButton({ onRetry, isRetrying, label, variant = "outline", size = "sm" }: RetryButtonProps) {
  const { t } = useTranslation("common");

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={isRetrying}
      focusableWhenDisabled
      className="data-disabled:pointer-events-none data-disabled:opacity-50"
      onClick={() => void onRetry()}
    >
      <span data-icon="inline-start" aria-hidden="true" className={cn("inline-flex", isRetrying && "animate-spin")}>
        <HugeiconsIcon icon={RefreshIcon} />
      </span>
      {label ?? t("actions.retry")}
    </Button>
  );
}

export function ErrorState({
  title,
  description,
  icon,
  tone = "destructive",
  onRetry,
  isRetrying = false,
  retryLabel,
  action,
  children,
  className,
}: ErrorStateProps) {
  const { t } = useTranslation("common");
  const isDestructive = tone === "destructive";
  const resolvedDescription = description === undefined && isDestructive ? t("error.loadDescription") : description;
  const hasActions = Boolean(onRetry) || Boolean(action);

  return (
    <div
      role={isDestructive ? "alert" : undefined}
      className={cn(
        "flex min-h-56 flex-col items-center justify-center rounded-xl border px-6 py-10 text-center",
        isDestructive ? "border-destructive/25 bg-destructive/5" : "border-dashed",
        className,
      )}
    >
      <HugeiconsIcon
        icon={icon ?? (isDestructive ? AlertCircleIcon : InformationCircleIcon)}
        aria-hidden="true"
        className={cn("size-7 shrink-0", isDestructive ? "text-destructive" : "text-muted-foreground")}
      />
      <p className="mt-3 text-sm font-semibold text-foreground">{title ?? t("error.loadTitle")}</p>
      {resolvedDescription ? <p className="mt-1 max-w-md text-sm leading-relaxed text-balance text-muted-foreground">{resolvedDescription}</p> : null}
      {hasActions ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? <RetryButton onRetry={onRetry} isRetrying={isRetrying} label={retryLabel} /> : null}
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

const MAST_FRAME_PATH =
  "M38 172L54 52M82 172L66 52M42 142H78M46 112H74M50 82H70M38 172L78 142M82 172L42 142M42 142L74 112M78 142L46 112M46 112L70 82M74 112L50 82M50 82L66 52M70 82L54 52M24 172H96M46 52H74M60 52V16M49 31H56M49 43H56M64 31H71M64 43H71";

const MAST_WAVES = [
  { d: "M78.02 21.38A22 22 0 0 1 78.02 46.62", opacity: 0.9, delay: "0ms" },
  { d: "M41.98 46.62A22 22 0 0 1 41.98 21.38", opacity: 0.9, delay: "0ms" },
  { d: "M87.85 14.5A34 34 0 0 1 87.85 53.5", opacity: 0.6, delay: "300ms" },
  { d: "M32.15 53.5A34 34 0 0 1 32.15 14.5", opacity: 0.6, delay: "300ms" },
  { d: "M97.68 7.62A46 46 0 0 1 97.68 60.38", opacity: 0.35, delay: "600ms" },
  { d: "M22.32 60.38A46 46 0 0 1 22.32 7.62", opacity: 0.35, delay: "600ms" },
];

const COVERAGE_RINGS = [
  "size-[200px] border-foreground/[0.08]",
  "size-[380px] border-foreground/[0.065]",
  "size-[600px] border-foreground/[0.05]",
  "size-[860px] border-foreground/[0.04]",
  "size-[1160px] border-foreground/[0.03]",
  "size-[1500px] border-foreground/[0.02]",
];

const GROUND_Y = 172;

const SIGNAL_BARS = [
  { x: 99, height: 4 },
  { x: 104, height: 7 },
  { x: 109, height: 10 },
  { x: 114, height: 13 },
];

function SignalMeter({ signal }: { signal: SignalStatus }) {
  return (
    <>
      <g stroke="none">
        {SIGNAL_BARS.map((bar, index) => {
          const isLit = signal === "unstable" && index === 0;
          return (
            <rect
              key={bar.x}
              x={bar.x}
              y={GROUND_Y - bar.height}
              width={3}
              height={bar.height}
              rx={0.75}
              fill="currentColor"
              opacity={isLit ? undefined : 0.35}
              className={isLit ? "animate-signal-flicker text-destructive motion-reduce:animate-none" : undefined}
            />
          );
        })}
      </g>
      {signal === "barred" ? <path d="M97 175L119 151" /> : null}
      {signal === "noService" ? <path d="M98.5 154L104.5 160M104.5 154L98.5 160" /> : null}
    </>
  );
}

function SignalMast({ icon, isDestructive, signal }: { icon: IconSvgElement; isDestructive: boolean; signal: SignalStatus }) {
  return (
    <div className="relative h-44 w-30">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[19%] -z-10">
        {COVERAGE_RINGS.map((ring) => (
          <span key={ring} className={cn("absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border", ring)} />
        ))}
      </div>
      <svg
        viewBox="0 0 120 176"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-full text-foreground/45"
      >
        <path d={MAST_FRAME_PATH} />
        <rect x="44" y="27" width="5" height="20" rx="1.5" className="fill-background" />
        <rect x="71" y="27" width="5" height="20" rx="1.5" className="fill-background" />
        <rect x="55.5" y="24" width="9" height="24" rx="1.5" className="fill-background" />
        <g className={isDestructive ? "text-destructive" : "text-muted-foreground"} strokeDasharray={isDestructive ? undefined : "2 5"}>
          {MAST_WAVES.map((wave) => (
            <path
              key={wave.d}
              d={wave.d}
              opacity={wave.opacity}
              style={isDestructive ? { animationDelay: wave.delay } : undefined}
              className={isDestructive ? "animate-signal-wave motion-reduce:animate-none" : undefined}
            />
          ))}
        </g>
        <SignalMeter signal={signal} />
      </svg>
      <span className="absolute top-[42%] left-[58%] flex size-9 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
        <HugeiconsIcon icon={icon} aria-hidden="true" className={cn("size-4.5", isDestructive ? "text-destructive" : "text-muted-foreground")} />
      </span>
    </div>
  );
}

export function PageErrorState({
  title,
  description,
  icon,
  tone = "destructive",
  signal,
  onRetry,
  isRetrying = false,
  retryLabel,
  action,
  children,
  className,
}: PageErrorStateProps) {
  const { t } = useTranslation("common");
  const isInPageContent = useContext(PageContentContext);
  const isDestructive = tone === "destructive";
  const resolvedDescription = description === undefined && isDestructive ? t("error.loadDescription") : description;
  const hasActions = Boolean(onRetry) || Boolean(action);

  return (
    <div className={cn("overflow-y-auto", isInPageContent ? "min-h-0 flex-1" : "h-dvh bg-background text-foreground", className)}>
      <div className={cn("relative isolate flex min-h-full items-center justify-center overflow-clip px-6", isInPageContent ? "py-12" : "py-10")}>
        <div className="flex w-full max-w-3xl flex-col items-center gap-8 md:flex-row md:justify-center md:gap-14">
          <SignalMast
            icon={icon ?? (isDestructive ? AlertCircleIcon : InformationCircleIcon)}
            isDestructive={isDestructive}
            signal={signal ?? (isDestructive ? "unstable" : "none")}
          />
          <div className="flex w-full max-w-md flex-col items-center text-center md:items-start md:text-left">
            <div role={isDestructive ? "alert" : undefined}>
              <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">{title ?? t("error.loadTitle")}</h1>
              {resolvedDescription ? <p className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground">{resolvedDescription}</p> : null}
            </div>
            {hasActions ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                {onRetry ? <RetryButton onRetry={onRetry} isRetrying={isRetrying} label={retryLabel} variant="default" size="default" /> : null}
                {action}
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InlineError({ title, description, onRetry, isRetrying = false, retryLabel, action, size = "default", className }: InlineErrorProps) {
  const { t } = useTranslation("common");
  const isSmall = size === "sm";
  const hasActions = Boolean(onRetry) || Boolean(action);

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start rounded-lg border border-destructive/25 bg-destructive/5",
        isSmall ? "gap-2 rounded-md border-transparent px-2 py-1.5" : "gap-2.5 px-3 py-2",
        className,
      )}
    >
      <HugeiconsIcon
        icon={AlertCircleIcon}
        aria-hidden="true"
        className={cn("shrink-0 text-destructive", isSmall ? "mt-px size-3.5" : "mt-0.5 size-4")}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-foreground", isSmall ? "text-xs leading-4" : "text-sm")}>{title ?? t("error.loadTitle")}</p>
        {description ? <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p> : null}
      </div>
      {hasActions ? (
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          {onRetry ? <RetryButton onRetry={onRetry} isRetrying={isRetrying} label={retryLabel} size={isSmall ? "xs" : "sm"} /> : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

export const STALE_NOTICE_CORNER_CLASS = "absolute top-2 right-2 z-40";

export function StaleDataNotice({ message, onRetry, isRetrying = false, className }: StaleDataNoticeProps) {
  const { t } = useTranslation("common");

  return (
    <div
      role="status"
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-md border border-destructive/30 bg-background/95 pl-2 text-xs text-destructive shadow-sm",
        onRetry ? "py-0.5 pr-0.5" : "py-1 pr-2",
        className,
      )}
    >
      <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0">{message ?? t("error.refreshFailed")}</span>
      {onRetry ? <RetryButton onRetry={onRetry} isRetrying={isRetrying} variant="ghost" size="xs" /> : null}
    </div>
  );
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return null;
}

export function ErrorDetails({ error }: { error: unknown }) {
  const { t } = useTranslation("common");
  const message = getErrorMessage(error);
  if (!message) return null;

  return (
    <details className="group/details mt-4 w-full text-left">
      <summary className="mx-auto flex w-fit cursor-pointer md:mx-0 list-none items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {t("error.details")}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          aria-hidden="true"
          className="size-3.5 transition-transform group-open/details:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap wrap-break-word text-foreground">
        {message}
      </pre>
    </details>
  );
}

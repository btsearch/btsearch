import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "@/components/ui/button";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { getCountryName } from "@/lib/geo/countryName";
import { type QueryLoadState, hasFailedLoad } from "@/lib/queryLoadState";
import { cn } from "@/lib/utils";

export type DashboardLayout = "columns" | "stack";
export type QueueSwitch = "on" | "off" | "unknown";
type CardView = "loading" | "failed" | "empty" | "ready";

type DashboardCardProps = {
  title: string;
  isFilling?: boolean;
  heading?: ReactNode;
  count?: number;
  headEnd?: ReactNode;
  notice?: ReactNode;
  footer?: ReactNode;
  isBusy?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

type RetryProps = {
  onRetry: () => unknown;
  isRetrying: boolean;
};

type CardNoticeProps = {
  title: string;
  icon?: IconSvgElement;
  action?: ReactNode;
};

type CardFooterProps = {
  shown: number;
  total: number;
  children: ReactNode;
};

type CardLoadingProps = {
  className?: string;
  children: ReactNode;
};

type CountryNameProps = {
  countryCode: string;
};

export const CARD_FOOTER_LINK_CLASS = cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground");
export const ROW_LINK_CLASS = "absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
export const ROW_CONTENT_CLASS = "pointer-events-none relative [&_a]:pointer-events-auto";

const STATE_FRAME_CLASS = "flex min-h-0 flex-1 flex-col p-3";

export function getCardView(query: QueryLoadState, rowCount: number): CardView {
  if (query.data === undefined) return hasFailedLoad(query) ? "failed" : "loading";
  return rowCount === 0 ? "empty" : "ready";
}

export function hasStaleRows(query: QueryLoadState): boolean {
  return query.isError && query.data !== undefined;
}

export function limitRows<T>(rows: readonly T[], layout: DashboardLayout, stackLimit: number): readonly T[] {
  return layout === "stack" ? rows.slice(0, stackLimit) : rows;
}

export function DashboardCard({
  title,
  isFilling = false,
  heading,
  count,
  headEnd,
  notice,
  footer,
  isBusy = false,
  className,
  bodyClassName,
  children,
}: DashboardCardProps) {
  const { i18n } = useTranslation();

  return (
    <section
      aria-label={title}
      aria-busy={isBusy}
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card", isFilling ? "min-h-0" : null, className)}
    >
      <div className="flex min-h-[41px] shrink-0 items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-sm font-semibold whitespace-nowrap">{heading ?? title}</h2>
          {count === undefined ? null : <span className="text-xs text-muted-foreground tabular-nums">{count.toLocaleString(i18n.language)}</span>}
        </div>
        {headEnd}
      </div>
      <div className={cn("relative flex flex-col", isFilling ? "min-h-0 flex-1" : null)}>
        {notice}
        <div className={cn("flex flex-col", isFilling ? "custom-scrollbar min-h-0 flex-1 overflow-y-auto" : null, bodyClassName)}>{children}</div>
      </div>
      {footer}
    </section>
  );
}

export function CardFooter({ shown, total, children }: CardFooterProps) {
  const { t, i18n } = useTranslation("common");

  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-t bg-muted/50 pr-2 pl-4">
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {t("pagination.showing", { shown, total: total.toLocaleString(i18n.language) })}
      </span>
      {children}
    </div>
  );
}

export function CardFooterLinkIcon() {
  return <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" aria-hidden="true" />;
}

export function CardLoading({ className, children }: CardLoadingProps) {
  const { t } = useTranslation("common");

  return (
    <div role="status" aria-label={t("actions.loading")} className={className}>
      {children}
    </div>
  );
}

export function CardLoadError({ onRetry, isRetrying }: RetryProps) {
  return (
    <div className={STATE_FRAME_CLASS}>
      <ErrorState className="flex-1" onRetry={onRetry} isRetrying={isRetrying} />
    </div>
  );
}

export function CardNotice({ title, icon, action }: CardNoticeProps) {
  return (
    <div className={STATE_FRAME_CLASS}>
      <ErrorState className="flex-1" tone="neutral" icon={icon} title={title} action={action} />
    </div>
  );
}

export function CardStaleNotice({ onRetry, isRetrying }: RetryProps) {
  return <StaleDataNotice onRetry={onRetry} isRetrying={isRetrying} className="absolute top-2 right-2 z-20 max-w-[calc(100%-1rem)]" />;
}

export function SystemSettingsLink() {
  const { t } = useTranslation("nav");

  return (
    <Link to="/admin/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
      {t("items.systemSettings")}
      <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" aria-hidden="true" />
    </Link>
  );
}

export function CountryName({ countryCode }: CountryNameProps) {
  const { i18n } = useTranslation();

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <CountryCodeTile code={countryCode} size="xs" />
      <span className="min-w-0 truncate">{getCountryName(countryCode, i18n.language)}</span>
    </span>
  );
}

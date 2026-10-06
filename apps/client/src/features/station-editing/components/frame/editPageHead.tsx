import { ArrowLeft01Icon, MapsLocation01Icon, SquareArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { TEXT_SEPARATOR } from "../../model/changes";
import { type BrandLook, BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { getStationMapHash } from "@/features/map/mapLinks";
import { CopyButton } from "@/features/station-details/components/copyButton";
import {
  stationDialogInlineActionClassName,
  stationDialogInlineActionLabelClassName,
} from "@/features/station-details/components/stationDialogActionBar";
import { getBrandColor } from "@/features/station-details/station/utils/brands";
import { useIsMobile } from "@/hooks/useMobile";
import { getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type HeadOperator = {
  name: string;
  brand: BrandLook | null;
};

type EditPageHeadProps = {
  operator?: HeadOperator | null;
  siteId?: string | null;
  badges?: ReactNode;
  compactBadges?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  links?: ReactNode;
  queue?: ReactNode;
  title?: ReactNode;
  backLabel?: string;
  onBack?: () => void;
};

type EditPageHeadLocationProps = {
  locationId?: number;
  city?: string | null;
  address?: string | null;
};

type EditPageHeadIdProps = {
  value: string;
  displayValue?: string;
};

type EditPageHeadTimestampProps = {
  label: string;
  value: string;
};

type EditPageHeadStationLinksProps = {
  stationId: number;
  place: { latitude: number; longitude: number } | null;
};

function goBack(): void {
  window.history.back();
}

export function EditPageHead({
  operator = null,
  siteId,
  badges,
  compactBadges,
  subtitle,
  meta,
  links,
  queue,
  title: pageTitle,
  backLabel,
  onBack = goBack,
}: EditPageHeadProps) {
  const { t } = useTranslation("common");
  const isPhone = useIsMobile();
  const hasSiteId = siteId !== undefined && siteId !== null && siteId !== "";
  const hasPageTitle = pageTitle !== undefined;
  const title = hasSiteId ? siteId : t("labels.newStation");
  const backText = backLabel ?? t("actions.back");

  if (isPhone) {
    return (
      <header className="flex h-13 shrink-0 items-center gap-2 border-b bg-background pr-2.5 pl-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={backText}
          onClick={onBack}
          className="shrink-0 cursor-pointer text-muted-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
        {operator === null ? null : (
          <>
            <BrandMark brand={operator.brand} size={18} />
            <span className="min-w-0 truncate text-[13.5px] font-semibold">{operator.name}</span>
          </>
        )}
        {hasPageTitle ? (
          <h1 className="min-w-0 truncate text-base font-bold">{pageTitle}</h1>
        ) : (
          <h1 className={cn("min-w-0 shrink-0 truncate text-base font-bold", hasSiteId ? "font-mono" : null)}>{title}</h1>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {compactBadges}
          {queue}
          {links}
        </div>
      </header>
    );
  }

  return (
    <header className="shrink-0 border-b bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 shrink-0 cursor-pointer gap-2 pr-3 pl-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          <span className="font-medium">{backText}</span>
        </Button>
        {queue}
      </div>

      <div
        className="flex items-center gap-3 border-t border-border/50 px-4 py-2.5"
        style={operator === null ? undefined : { backgroundImage: getOperatorHeaderTintGradient(getBrandColor(operator.brand)) }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {operator === null ? null : (
              <div className="flex min-w-0 items-center gap-2">
                <BrandMark brand={operator.brand} size={20} />
                <h2 className="min-w-0 truncate text-base leading-5 font-semibold tracking-tight text-foreground">{operator.name}</h2>
              </div>
            )}
            {hasPageTitle ? (
              <h1 className="text-lg font-semibold tracking-tight">{pageTitle}</h1>
            ) : (
              <h1 className={cn("shrink-0 text-sm font-medium text-muted-foreground", hasSiteId ? "font-mono" : null)}>{title}</h1>
            )}
            {badges}
          </div>
          {subtitle || meta ? (
            <div className="flex min-w-0 items-center gap-x-3">
              {subtitle ? <div className="min-w-0 truncate text-xs leading-4 text-muted-foreground">{subtitle}</div> : null}
              {meta ? <div className="flex shrink-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">{meta}</div> : null}
            </div>
          ) : null}
        </div>
        {links ? <div className="flex shrink-0 items-center gap-1">{links}</div> : null}
      </div>
    </header>
  );
}

export function EditPageHeadLocation({ locationId, city, address }: EditPageHeadLocationProps) {
  const label = (
    <>
      {city ? <span className="font-semibold text-foreground">{city}</span> : null}
      {city && address ? TEXT_SEPARATOR : null}
      {address}
    </>
  );
  if (locationId === undefined) return label;

  return (
    <Link
      to="/admin/locations/$id"
      params={{ id: String(locationId) }}
      className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
    >
      {label}
    </Link>
  );
}

export function EditPageHeadId({ value, displayValue }: EditPageHeadIdProps) {
  const { t } = useTranslation("common");

  return (
    <span className="group/copy inline-flex items-center gap-0.5 whitespace-nowrap">
      {t("labels.id")}:{" "}
      <span className="font-mono tabular-nums" title={displayValue === undefined ? undefined : value}>
        {displayValue ?? value}
      </span>
      <CopyButton text={value} compact />
    </span>
  );
}

export function EditPageHeadTimestamp({ label, value }: EditPageHeadTimestampProps) {
  const { i18n } = useTranslation("common");

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-default whitespace-nowrap">
        {label}: <RelativeTime date={value} />
      </TooltipTrigger>
      <TooltipContent>{formatFullDate(value, i18n.language)}</TooltipContent>
    </Tooltip>
  );
}

export function EditPageHeadSeparator() {
  return (
    <span className="text-muted-foreground/40" aria-hidden="true">
      ·
    </span>
  );
}

export function EditPageHeadStationLinks({ stationId, place }: EditPageHeadStationLinksProps) {
  const { t } = useTranslation("common");
  const { openStationDialog } = useFloatingDialogStack();

  return (
    <>
      {place === null ? null : (
        <Link
          to="/"
          hash={getStationMapHash(stationId, place)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("actions.showOnMap")}
          className={stationDialogInlineActionClassName}
        >
          <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
          <span className={stationDialogInlineActionLabelClassName}>{t("actions.showOnMap")}</span>
        </Link>
      )}
      <button
        type="button"
        onClick={() => openStationDialog(stationId, "internal")}
        aria-label={t("actions.view")}
        className={stationDialogInlineActionClassName}
      >
        <HugeiconsIcon icon={SquareArrowExpand01Icon} className="size-3.5" />
        <span className={stationDialogInlineActionLabelClassName}>{t("actions.view")}</span>
      </button>
    </>
  );
}

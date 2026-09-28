import { ArrowLeft01Icon, MapsLocation01Icon, SquareArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { CopyButton } from "@/features/station-details/components/copyButton";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import {
  stationDialogInlineActionClassName,
  stationDialogInlineActionLabelClassName,
} from "@/features/station-details/components/stationDialogActionBar";
import { useIsMobile } from "@/hooks/useMobile";
import { useScrolled } from "@/hooks/useScrolled";
import { getOperatorColor, getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Station } from "@/types/station";

type DetailHeaderProps = {
  actionBar: ReactNode;
  operator?: { name: string; mnc?: number | null } | null;
  stationCode?: string | null;
  badges?: ReactNode;
  compactBadges?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function DetailHeader({ actionBar, operator, stationCode, badges, compactBadges, subtitle, meta, actions }: DetailHeaderProps) {
  const { t } = useTranslation("common");
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const { ref: headerRef, scrolled } = useScrolled();
  const backRowRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const [isIdentityHidden, setIsIdentityHidden] = useState(false);

  useEffect(() => {
    const backRow = backRowRef.current;
    const identity = identityRef.current;
    if (!isMobile || !backRow || !identity) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setIsIdentityHidden(!entry.isIntersecting);
      },
      { rootMargin: `-${Math.ceil(backRow.getBoundingClientRect().bottom)}px 0px 0px 0px` },
    );
    observer.observe(identity);
    return () => observer.disconnect();
  }, [isMobile]);

  const showCompactTitle = isMobile && isIdentityHidden;
  const title = stationCode || t("labels.newStation");
  const operatorColor = operator ? getOperatorColor(operator.mnc ?? 0) : undefined;

  return (
    <>
      <div
        ref={headerRef}
        className={cn(
          "contents md:block md:shrink-0 md:border-b md:border-border md:bg-background md:sticky md:top-0 md:z-20 md:transition-[background-color,border-color,box-shadow] md:duration-150",
          scrolled ? "md:shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "md:border-transparent md:shadow-none",
        )}
      >
        <div
          ref={backRowRef}
          className={cn(
            "flex items-center justify-between gap-3 px-4 py-2 max-md:sticky max-md:top-0 max-md:z-30 max-md:border-b max-md:border-border max-md:bg-background max-md:transition-[background-color,border-color,box-shadow] max-md:duration-150",
            scrolled ? "max-md:shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "max-md:border-b-transparent max-md:shadow-none",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.history.back()}
              className="shrink-0 text-muted-foreground hover:text-foreground gap-2 pl-1 pr-3 -ml-2 hover:bg-muted/50 transition-colors"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              <span className="font-medium">{t("actions.back")}</span>
            </Button>
            <div
              inert={!showCompactTitle}
              className={cn(
                "flex min-w-0 items-center gap-1.5 transition-[opacity,translate] duration-150 ease-out motion-reduce:transition-none md:hidden",
                showCompactTitle ? "opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              {operator ? <DialogOperatorName name={operator.name} mnc={operator.mnc} compact /> : null}
              <span className={cn("shrink-0 text-xs font-medium text-muted-foreground", stationCode && "font-mono")}>{title}</span>
              {compactBadges}
            </div>
          </div>
          {!navActionTarget && actionBar}
        </div>

        <div
          ref={identityRef}
          className="flex items-center gap-3 border-border/50 bg-background px-4 py-2.5 max-md:border-b md:border-t"
          style={operatorColor ? { backgroundImage: getOperatorHeaderTintGradient(operatorColor) } : undefined}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {operator ? <DialogOperatorName name={operator.name} mnc={operator.mnc} /> : null}
              <h1 className={cn("shrink-0 text-sm font-medium text-muted-foreground", stationCode && "font-mono")}>{title}</h1>
              {badges}
            </div>
            {subtitle || meta ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 md:flex-nowrap">
                {subtitle ? <div className="min-w-0 truncate text-xs leading-4 text-muted-foreground">{subtitle}</div> : null}
                {meta ? (
                  <div className="flex shrink-0 flex-col items-start text-[11px] leading-4 text-muted-foreground/80 sm:flex-row sm:items-center sm:gap-1.5">
                    {meta}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      </div>

      {navActionTarget ? createPortal(actionBar, navActionTarget) : null}
    </>
  );
}

type DetailHeaderLocationProps = {
  locationId?: number;
  city?: string | null;
  address?: string | null;
};

export function DetailHeaderLocation({ locationId, city, address }: DetailHeaderLocationProps) {
  const label = (
    <>
      {city ? <span className="font-semibold text-foreground">{city}</span> : null}
      {city && address ? " · " : null}
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

type DetailHeaderIdProps = {
  value: string;
  displayValue?: string;
};

export function DetailHeaderId({ value, displayValue }: DetailHeaderIdProps) {
  const { t } = useTranslation("common");

  return (
    <span className="group/copy inline-flex items-center gap-0.5 whitespace-nowrap">
      {t("labels.id")}:{" "}
      <span className="font-mono tabular-nums" title={displayValue ? value : undefined}>
        {displayValue ?? value}
      </span>
      <CopyButton text={value} compact />
    </span>
  );
}

type DetailHeaderTimestampProps = {
  label: string;
  value: string;
};

export function DetailHeaderTimestamp({ label, value }: DetailHeaderTimestampProps) {
  const { t, i18n } = useTranslation("common");

  return (
    <Tooltip>
      <TooltipTrigger className="cursor-default whitespace-nowrap">
        {label}: {formatRelativeTime(value, t)}
      </TooltipTrigger>
      <TooltipContent>{formatFullDate(value, i18n.language)}</TooltipContent>
    </Tooltip>
  );
}

export function DetailHeaderSeparator() {
  return (
    <span className="hidden text-muted-foreground/40 sm:inline" aria-hidden>
      ·
    </span>
  );
}

type DetailHeaderStationActionsProps = {
  station: Pick<Station, "id" | "location">;
};

export function DetailHeaderStationActions({ station }: DetailHeaderStationActionsProps) {
  const { t } = useTranslation("common");
  const { openStationDialog } = useFloatingDialogStack();

  return (
    <>
      <Link
        to="/"
        hash={`map=16/${station.location.latitude}/${station.location.longitude}~f~S${station.id}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("actions.showOnMap")}
        className={stationDialogInlineActionClassName}
      >
        <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
        <span className={stationDialogInlineActionLabelClassName}>{t("actions.showOnMap")}</span>
      </Link>
      <button
        type="button"
        onClick={() => openStationDialog(station.id, "internal")}
        aria-label={t("actions.view")}
        className={stationDialogInlineActionClassName}
      >
        <HugeiconsIcon icon={SquareArrowExpand01Icon} className="size-3.5" />
        <span className={stationDialogInlineActionLabelClassName}>{t("actions.view")}</span>
      </button>
    </>
  );
}

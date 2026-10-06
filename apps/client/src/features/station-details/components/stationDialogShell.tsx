import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { FALLBACK_BRAND_COLOR } from "../station/utils/brands";
import { DialogOperatorName } from "./dialogOperatorName";
import { StationDialogActionBar, stationDialogInlineActionClassName, stationDialogInlineActionLabelClassName } from "./stationDialogActionBar";
import { WatchButton } from "./watchButton";
import { SOURCE_SWITCH_SLIDE_MS, SourceSwitch } from "@/components/cellular/sourceSwitch";
import { CloseButton } from "@/components/ui/close-button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FloatingDialogPanelFrameProps } from "@/features/floating-dialogs/types";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { isTerrainProfileAvailable } from "@/features/terrain-profile/availability";
import { TerrainProfileAnalyzeButton } from "@/features/terrain-profile/components/terrainProfileAnalyzeButton";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { getOperatorColor, getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

const ENTER_FROM_CLASS_NAMES = {
  left: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-3 motion-safe:duration-200",
  right: "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-3 motion-safe:duration-200",
} as const;

type StationDialogShellProps = FloatingDialogPanelFrameProps & {
  operatorMnc?: number | null;
  tintColor?: string;
  heading: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  sourceSwitch?: ReactNode;
  banners?: ReactNode;
  strip?: ReactNode;
  aside?: ReactNode;
  bodyKey?: number;
  enterFrom?: keyof typeof ENTER_FROM_CLASS_NAMES;
  children: ReactNode;
};

export function StationDialogShell({
  operatorMnc,
  tintColor,
  heading,
  actions,
  toolbar,
  sourceSwitch,
  banners,
  strip,
  aside,
  bodyKey,
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
  const operatorColor = tintColor ?? (typeof operatorMnc === "number" ? getOperatorColor(operatorMnc) : FALLBACK_BRAND_COLOR);
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
        {strip}
        <div key={bodyKey} ref={bodyRef} className="relative flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable">
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
  operatorMark?: ReactNode;
  stationCode: string;
  badges?: ReactNode;
  location?: { city: string | null; address: string | null } | null;
  addressLine?: ReactNode;
  status?: ReactNode;
  createdAt?: string;
  updatedAt?: string;
};

export function StationDialogHeading({
  operatorName,
  operatorMnc,
  operatorMark,
  stationCode,
  badges,
  location,
  addressLine,
  status,
  createdAt,
  updatedAt,
}: StationDialogHeadingProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { t: tCommon } = useTranslation("common");

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pr-28 sm:pr-0">
        {operatorMark === undefined ? (
          <DialogOperatorName name={operatorName} mnc={operatorMnc} />
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            {operatorMark}
            <DialogOperatorName name={operatorName} />
          </div>
        )}
        <span className="shrink-0 font-mono text-xs font-medium text-muted-foreground">{stationCode}</span>
        {badges}
      </div>
      {location ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">{location.city}</p>
            {status}
          </div>
          <p className="text-xs leading-4 text-muted-foreground">{addressLine ?? (location.address || t("dialog.btsStation"))}</p>
        </>
      ) : null}
      {createdAt && updatedAt ? (
        <div className="flex flex-col items-start pt-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <Tooltip>
            <TooltipTrigger className="cursor-default whitespace-nowrap text-[11px] leading-4 text-muted-foreground/80">
              {tCommon("labels.created")}: <RelativeTime date={createdAt} />
            </TooltipTrigger>
            <TooltipContent>{formatFullDate(createdAt, i18n.language)}</TooltipContent>
          </Tooltip>
          <span className="hidden text-[11px] leading-4 text-muted-foreground/40 sm:inline">·</span>
          <time
            dateTime={updatedAt}
            title={formatFullDate(updatedAt, i18n.language)}
            className="whitespace-nowrap text-[11px] leading-4 text-muted-foreground/80"
          >
            {tCommon("labels.updated")}: <RelativeTime date={updatedAt} />
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
  const reduceMotion = useReducedMotion() === true;
  const [selected, setSelected] = useState(source);
  const switchSource = useEffectEvent(onSwitch);

  useEffect(() => {
    if (selected === source) return;
    const timeoutId = window.setTimeout(() => switchSource(), reduceMotion ? 0 : SOURCE_SWITCH_SLIDE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [reduceMotion, selected, source]);

  return <SourceSwitch source={selected} onSourceChange={setSelected} onSwitchIntent={onPrefetch} />;
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

type StationDialogActionsProps = {
  source: StationSource;
  id: number;
  stationCode: string;
  operatorId: number | null;
  operatorName: string;
  countryCode: string | null;
  location: { latitude: number; longitude: number; city?: string | null; address?: string | null } | null;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
  onClose: () => void;
};

export function StationDialogActions({
  source,
  id,
  stationCode,
  operatorId,
  operatorName,
  countryCode,
  location,
  onStartTerrainProfile,
  onClose,
}: StationDialogActionsProps) {
  return (
    <>
      <AddToListPopover
        stationId={source === "internal" ? id : undefined}
        ukeStationId={source === "uke" ? id : undefined}
        size="md"
        className={stationDialogInlineActionClassName}
        showLabel
        labelClassName={stationDialogInlineActionLabelClassName}
        showTooltip={false}
      />
      <WatchButton
        stationId={id}
        source={source}
        className={stationDialogInlineActionClassName}
        labelClassName={stationDialogInlineActionLabelClassName}
      />
      {onStartTerrainProfile && location && isTerrainProfileAvailable(source, countryCode) ? (
        <TerrainProfileAnalyzeButton
          target={{
            source,
            id,
            operatorId,
            siteId: stationCode,
            operatorName,
            latitude: location.latitude,
            longitude: location.longitude,
            city: location.city ?? null,
            address: location.address ?? null,
          }}
          onStart={(target) => {
            onStartTerrainProfile(target);
            onClose();
          }}
          className={stationDialogInlineActionClassName}
          labelClassName={stationDialogInlineActionLabelClassName}
        />
      ) : null}
    </>
  );
}

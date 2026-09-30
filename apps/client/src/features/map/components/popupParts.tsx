import { Copy01Icon, Location01Icon, Share08Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, type ReactNode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DEFAULT_COLOR } from "../geojson";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OperatorMark } from "@/features/station-details/components/dialogOperatorName";
import { useGpsFormat } from "@/hooks/usePreferences";
import { getOperatorColor, getOperatorTintGradient } from "@/lib/cellular/operators";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";

const AddToListPopover = lazy(() => import("@/features/lists/components/addToListPopover").then((m) => ({ default: m.AddToListPopover })));

const COPIED_RESET_MS = 2000;
const TITLE_RESERVE_CLASS_NAMES = ["", "pr-5.5", "pr-11.5", "pr-17.5"];

function useCopyToClipboard() {
  const { t } = useTranslation("stationDetails");
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(resetTimerRef.current), []);

  const markCopied = () => {
    window.clearTimeout(resetTimerRef.current);
    setCopied(true);
    resetTimerRef.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(markCopied, () => toast.error(t("copyFailed")));
  };

  return [copied, copy] as const;
}

type PopupIconButtonProps = Omit<ComponentProps<typeof TooltipTrigger>, "render" | "className"> & {
  label: string;
  size?: "icon-xs" | "xs";
  className?: string;
};

export function PopupIconButton({ label, size = "icon-xs", className, children, ...props }: PopupIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        {...props}
        aria-label={label}
        render={<Button type="button" variant="ghost" size={size} className={cn("cursor-pointer text-muted-foreground", className)} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function PopupAddToListButton(props: ComponentProps<typeof AddToListPopover>) {
  return (
    <Suspense>
      <AddToListPopover {...props} />
    </Suspense>
  );
}

type PopupShareButtonProps = {
  url: string;
  title: string;
  label: string;
};

export function PopupShareButton({ url, title, label }: PopupShareButtonProps) {
  const { t } = useTranslation("main");
  const [copied, copy] = useCopyToClipboard();

  const handleShare = () => {
    if (navigator.share) {
      void navigator.share({ title, url }).catch(() => {});
      return;
    }
    copy(url);
  };

  return (
    <PopupIconButton label={copied ? t("common:actions.linkCopied") : label} onClick={handleShare}>
      <HugeiconsIcon icon={copied ? Tick02Icon : Share08Icon} className={copied ? "text-emerald-500" : undefined} />
    </PopupIconButton>
  );
}

export function PopupCoordinatesFooter({ latitude, longitude }: { latitude: number; longitude: number }) {
  const { t } = useTranslation(["main", "common"]);
  const gpsFormat = useGpsFormat();
  const [copied, copy] = useCopyToClipboard();

  const handleCopy = () => copy(`${latitude}, ${longitude}`);

  return (
    <div className="flex h-7 items-center gap-1.5 border-t border-border/50 pr-1.5 pl-3">
      <HugeiconsIcon icon={Location01Icon} className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground tabular-nums">
        <span className="sr-only">{t("common:labels.coordinates")} </span>
        {formatCoordinates(latitude, longitude, gpsFormat)}
      </span>
      <PopupIconButton label={copied ? t("common:actions.copied") : t("main:popup.copyCoordinates")} onClick={handleCopy}>
        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className={copied ? "text-emerald-500" : undefined} />
      </PopupIconButton>
    </div>
  );
}

type PopupLocationHeaderProps = {
  city?: string | null;
  region?: string | null;
  address?: string | null;
  actions?: ReactNode;
};

export function PopupLocationHeader({ city, region, address, actions }: PopupLocationHeaderProps) {
  const { t } = useTranslation("main");

  return (
    <div className={cn("flow-root border-b border-border/50 py-2 pl-3", actions ? "pr-1.5" : "pr-3")}>
      {actions ? <div className="float-right -my-0.5 ml-2 flex items-center">{actions}</div> : null}
      <h3 className="overflow-x-clip text-sm leading-5 font-medium">
        {city || t("common:labels.unknownLocation")}
        {region ? (
          <>
            <span className="[word-spacing:0.375rem]"> </span>
            <span className="text-[11px] font-normal whitespace-nowrap text-muted-foreground">
              <span className="-ml-1.5 inline-block w-1.5">·</span>
              {region}
            </span>
          </>
        ) : null}
      </h3>
      {address ? <p className="text-[11px] text-muted-foreground">{address}</p> : null}
    </div>
  );
}

export function PopupOperatorName({ name }: { name: string }) {
  return <span className="min-w-0 truncate text-xs font-medium text-foreground">{name}</span>;
}

export function PopupStationId({ id }: { id: string }) {
  return <span className="shrink-0 font-mono text-xs font-medium text-foreground/70 tabular-nums">{id}</span>;
}

export function PopupExpiredLabel() {
  const { t } = useTranslation("common");

  return <span className="shrink-0 text-[11px] leading-none font-semibold text-red-700 dark:text-red-300">{t("status.expired")}</span>;
}

type PopupRowProps = {
  mnc: number | null | undefined;
  title: ReactNode;
  actions?: ReactNode;
  actionCount?: number;
  onOpen?: () => void;
  className?: string;
  children?: ReactNode;
};

export function PopupRow({ mnc, title, actions, actionCount = 0, onOpen, className, children }: PopupRowProps) {
  const hasMnc = mnc !== null && mnc !== undefined;
  const style = { backgroundImage: getOperatorTintGradient(hasMnc ? getOperatorColor(mnc) : DEFAULT_COLOR) };
  const body = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
        {hasMnc ? <OperatorMark mnc={mnc} compact /> : <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: DEFAULT_COLOR }} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("flex min-h-4 flex-wrap items-center gap-x-1.5 gap-y-0.5", TITLE_RESERVE_CLASS_NAMES[actionCount])}>{title}</div>
        {children}
      </div>
    </>
  );

  return (
    <div className="relative border-b border-border/30 last:border-0">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "flex w-full cursor-pointer gap-1.5 px-3 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
            className,
          )}
          style={style}
        >
          {body}
        </button>
      ) : (
        <div className={cn("flex gap-1.5 px-3 py-2", className)} style={style}>
          {body}
        </div>
      )}
      {actions ? <div className="absolute top-1 right-1.5 flex items-center">{actions}</div> : null}
    </div>
  );
}

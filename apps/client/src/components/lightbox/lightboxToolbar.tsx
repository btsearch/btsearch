import {
  Cancel01Icon,
  CarouselHorizontalIcon,
  Download04Icon,
  InformationCircleIcon,
  KeyboardIcon,
  Link01Icon,
  MaximizeScreenIcon,
  MinimizeScreenIcon,
  SearchAddIcon,
  SearchMinusIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { motion, useTransform } from "motion/react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { LightboxSlide } from "./types";
import type { FullscreenController } from "./useFullscreen";
import { ZOOMED_THRESHOLD, type ZoomController } from "./useZoomPan";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hasCoarsePointer } from "@/lib/dom/pointer";
import { cn } from "@/lib/utils";

const TOOLBAR_BUTTON = cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "cursor-pointer max-md:size-10");

function getShareMode(): "share" | "copy" | null {
  if (typeof navigator.share === "function" && hasCoarsePointer()) return "share";
  if (typeof navigator.clipboard?.writeText === "function") return "copy";
  return null;
}

function ToolbarTooltip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <TooltipContent side="bottom" className="dark flex items-center gap-2">
      {label}
      {shortcut ? <kbd className="rounded border border-background/30 px-1 font-sans text-[10px] leading-4 opacity-70">{shortcut}</kbd> : null}
    </TooltipContent>
  );
}

type ToolbarButtonProps = {
  label: string;
  icon: IconSvgElement;
  shortcut?: string;
  pressed?: boolean;
  onClick?: () => void;
  render?: ReactElement;
  className?: string;
};

function ToolbarButton({ label, icon, shortcut, pressed, onClick, render, className }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={render ?? <button type="button" />}
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(TOOLBAR_BUTTON, pressed ? "bg-primary/10 text-primary hover:text-primary" : "text-foreground/80", className)}
      >
        <HugeiconsIcon icon={icon} className="size-5" aria-hidden="true" />
      </TooltipTrigger>
      <ToolbarTooltip label={label} shortcut={shortcut} />
    </Tooltip>
  );
}

type Props = {
  slide: LightboxSlide;
  index: number;
  count: number;
  zoom: ZoomController;
  showPeekToggle: boolean;
  peek: boolean;
  onTogglePeek: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  fullscreen: FullscreenController;
  onShowShortcuts: () => void;
  onClose: () => void;
};

export function LightboxToolbar({
  slide,
  index,
  count,
  zoom,
  showPeekToggle,
  peek,
  onTogglePeek,
  detailsOpen,
  onToggleDetails,
  fullscreen,
  onShowShortcuts,
  onClose,
}: Props) {
  const { t } = useTranslation("lightbox");
  const isLocalFile = slide.src.startsWith("blob:");
  const shareMode = getShareMode();
  const fitLabel = t("fit");
  const zoomLabel = useTransform(() => {
    const scale = zoom.scale.get();
    const fitRatio = zoom.fitRatio.get();
    return scale <= ZOOMED_THRESHOLD ? fitLabel : `${Math.round(scale * fitRatio * 100)}%`;
  });

  async function share() {
    const url = new URL(slide.src, window.location.href).href;
    if (shareMode === "share") {
      await navigator.share({ url, title: slide.alt }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("common:actions.linkCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="flex h-14 items-center gap-0.5 px-2 md:gap-1 md:px-3">
      <ToolbarButton label={t("common:actions.close")} icon={Cancel01Icon} onClick={onClose} className="md:hidden" />
      {count > 1 ? (
        <span className="ml-1.5 shrink-0 text-sm text-foreground/80 tabular-nums">
          {index + 1} / {count}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 px-2" />

      <div className="flex items-center max-md:hidden">
        <ToolbarButton label={t("zoomOut")} icon={SearchMinusIcon} shortcut="−" onClick={zoom.zoomOut} />
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" />}
            aria-label={t("actualSize")}
            onClick={zoom.toggleActualSize}
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "min-w-14 cursor-pointer px-2 text-xs text-foreground/80 tabular-nums")}
          >
            <motion.span>{zoomLabel}</motion.span>
          </TooltipTrigger>
          <ToolbarTooltip label={t("actualSize")} shortcut="1" />
        </Tooltip>
        <ToolbarButton label={t("zoomIn")} icon={SearchAddIcon} shortcut="+" onClick={zoom.zoomIn} />
        <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-border" />
      </div>

      {showPeekToggle ? (
        <ToolbarButton
          label={peek ? t("hideNeighbours") : t("showNeighbours")}
          icon={CarouselHorizontalIcon}
          shortcut="P"
          pressed={peek}
          onClick={onTogglePeek}
          className="max-md:hidden"
        />
      ) : null}
      <ToolbarButton label={t("common:labels.details")} icon={InformationCircleIcon} shortcut="I" pressed={detailsOpen} onClick={onToggleDetails} />
      <ToolbarButton
        label={t("common:actions.download")}
        icon={Download04Icon}
        render={<a href={slide.fullSrc ?? slide.src} download={slide.downloadName ?? ""} />}
        className="max-md:hidden"
      />
      {shareMode !== null && !isLocalFile ? (
        <ToolbarButton
          label={shareMode === "share" ? t("common:actions.share") : t("common:actions.copyLink")}
          icon={shareMode === "share" ? Share08Icon : Link01Icon}
          onClick={() => void share()}
        />
      ) : null}
      {fullscreen.supported ? (
        <ToolbarButton
          label={fullscreen.active ? t("exitFullscreen") : t("fullscreen")}
          icon={fullscreen.active ? MinimizeScreenIcon : MaximizeScreenIcon}
          shortcut="F"
          onClick={fullscreen.toggle}
          className="max-md:hidden"
        />
      ) : null}
      <ToolbarButton label={t("shortcuts")} icon={KeyboardIcon} shortcut="?" onClick={onShowShortcuts} className="max-md:hidden" />
      <ToolbarButton label={t("common:actions.close")} icon={Cancel01Icon} shortcut="Esc" onClick={onClose} className="max-md:hidden" />
    </div>
  );
}

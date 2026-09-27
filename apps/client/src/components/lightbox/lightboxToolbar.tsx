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
import { HugeiconsIcon } from "@hugeicons/react";
import { type MotionValue, motion } from "motion/react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { LightboxSlide } from "./types";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconType = ComponentProps<typeof HugeiconsIcon>["icon"];

const TOOLBAR_BUTTON = cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "cursor-pointer max-md:size-10");
const TOOLTIP = "dark flex items-center gap-2";

function ShortcutHint({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-background/30 px-1 font-sans text-[10px] leading-4 opacity-70">{children}</kbd>;
}

type ToolbarButtonProps = {
  label: string;
  icon: IconType;
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
      <TooltipContent side="bottom" className={TOOLTIP}>
        {label}
        {shortcut ? <ShortcutHint>{shortcut}</ShortcutHint> : null}
      </TooltipContent>
    </Tooltip>
  );
}

type Props = {
  slide: LightboxSlide;
  index: number;
  count: number;
  title?: ReactNode;
  actions?: ReactNode;
  zoomLabel: MotionValue<string>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleActualSize: () => void;
  showPeekToggle: boolean;
  peek: boolean;
  onTogglePeek: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  shareMode: "share" | "copy" | null;
  onShare: () => void;
  canFullscreen: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onShowShortcuts: () => void;
  onClose: () => void;
};

export function LightboxToolbar({
  slide,
  index,
  count,
  title,
  actions,
  zoomLabel,
  onZoomIn,
  onZoomOut,
  onToggleActualSize,
  showPeekToggle,
  peek,
  onTogglePeek,
  detailsOpen,
  onToggleDetails,
  shareMode,
  onShare,
  canFullscreen,
  isFullscreen,
  onToggleFullscreen,
  onShowShortcuts,
  onClose,
}: Props) {
  const { t } = useTranslation("lightbox");
  const isLocalFile = slide.src.startsWith("blob:");

  return (
    <div className="flex h-14 items-center gap-0.5 px-2 md:gap-1 md:px-3">
      <ToolbarButton label={t("close")} icon={Cancel01Icon} onClick={onClose} className="md:hidden" />
      {count > 1 ? (
        <span className="ml-1.5 shrink-0 text-sm text-foreground/80 tabular-nums">
          {index + 1} / {count}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 truncate px-2 text-sm text-foreground/70">{title}</div>

      <div className="flex items-center max-md:hidden">
        <ToolbarButton label={t("zoomOut")} icon={SearchMinusIcon} shortcut="−" onClick={onZoomOut} />
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" />}
            aria-label={t("actualSize")}
            onClick={onToggleActualSize}
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "min-w-14 cursor-pointer px-2 text-xs text-foreground/80 tabular-nums")}
          >
            <motion.span>{zoomLabel}</motion.span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className={TOOLTIP}>
            {t("actualSize")}
            <ShortcutHint>1</ShortcutHint>
          </TooltipContent>
        </Tooltip>
        <ToolbarButton label={t("zoomIn")} icon={SearchAddIcon} shortcut="+" onClick={onZoomIn} />
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
      <ToolbarButton label={t("details")} icon={InformationCircleIcon} shortcut="I" pressed={detailsOpen} onClick={onToggleDetails} />
      {actions}
      <ToolbarButton
        label={t("download")}
        icon={Download04Icon}
        render={<a href={slide.src} download={slide.downloadName ?? ""} />}
        className="max-md:hidden"
      />
      {shareMode !== null && !isLocalFile ? (
        <ToolbarButton
          label={shareMode === "share" ? t("share") : t("copyLink")}
          icon={shareMode === "share" ? Share08Icon : Link01Icon}
          onClick={onShare}
        />
      ) : null}
      {canFullscreen ? (
        <ToolbarButton
          label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
          icon={isFullscreen ? MinimizeScreenIcon : MaximizeScreenIcon}
          shortcut="F"
          onClick={onToggleFullscreen}
          className="max-md:hidden"
        />
      ) : null}
      <ToolbarButton label={t("shortcuts")} icon={KeyboardIcon} shortcut="?" onClick={onShowShortcuts} className="max-md:hidden" />
      <ToolbarButton label={t("close")} icon={Cancel01Icon} shortcut="Esc" onClick={onClose} className="max-md:hidden" />
    </div>
  );
}

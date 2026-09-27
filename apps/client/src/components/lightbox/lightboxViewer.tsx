import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect, useImperativeHandle, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";

import { LightboxCaption } from "./lightboxCaption";
import { LightboxDetails } from "./lightboxDetails";
import { LightboxFilmstrip } from "./lightboxFilmstrip";
import { LightboxShortcuts } from "./lightboxShortcuts";
import { LightboxStage } from "./lightboxStage";
import { LightboxToolbar } from "./lightboxToolbar";
import { hasSlideAt, mod } from "./reelLayout";
import type { LightboxProps, Size } from "./types";
import { useFullscreen } from "./useFullscreen";
import { togglePeekPreference, usePeekPreference } from "./usePeekPreference";
import { useZoomPan } from "./useZoomPan";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

const PAN_STEP = 120;

export type LightboxViewerHandle = {
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  handleEscape: () => boolean;
};

type Props = Omit<LightboxProps, "index" | "onIndexChange"> & {
  index: number;
  onIndexChange: (index: number) => void;
  closing: boolean;
  onExited: () => void;
  backdrop: MotionValue<number>;
  handleRef: RefObject<LightboxViewerHandle | null>;
};

export function LightboxViewer({ slides, index, onIndexChange, onClose, loop = true, getTrigger, closing, onExited, backdrop, handleRef }: Props) {
  const { t } = useTranslation("lightbox");
  const compact = useIsMobile();
  const reduceMotion = useReducedMotion();
  const peekPreference = usePeekPreference();
  const zoom = useZoomPan();
  const fullscreen = useFullscreen();
  const chrome = useMotionValue(0);
  const [position, setPosition] = useState(index);
  const [generation, setGeneration] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, Size>>({});

  const count = slides.length;
  const effectiveLoop = loop && count > 2;
  if (effectiveLoop ? mod(position, count) !== index : position !== index) {
    setPosition(index);
    setGeneration((value) => value + 1);
  }

  const slide = slides[index];
  const peek = peekPreference && !compact;

  function canNavigate(delta: -1 | 1) {
    return hasSlideAt(index, delta, count, effectiveLoop);
  }

  function goTo(delta: -1 | 1) {
    if (closing || !canNavigate(delta)) return;
    zoom.reset(false);
    const nextPosition = position + delta;
    setPosition(nextPosition);
    onIndexChange(mod(nextPosition, count));
  }

  function jumpTo(target: number) {
    if (closing || target === index || target < 0 || target >= count) return;
    if (target === mod(index + 1, count) && canNavigate(1)) {
      goTo(1);
      return;
    }
    if (target === mod(index - 1, count) && canNavigate(-1)) {
      goTo(-1);
      return;
    }
    zoom.reset(false);
    setPosition(target);
    setGeneration((value) => value + 1);
    onIndexChange(target);
  }

  function handleNaturalSize(src: string, size: Size) {
    setNaturalSizes((previous) => {
      const known = previous[src];
      if (known && known.width === size.width && known.height === size.height) return previous;
      return { ...previous, [src]: size };
    });
  }

  function handleTap() {
    if (compact && detailsOpen) {
      setDetailsOpen(false);
      return;
    }
    setChromeVisible((value) => !value);
  }

  function toggleDetails() {
    setDetailsOpen((value) => !value);
  }

  function handleEscape() {
    if (shortcutsOpen) {
      setShortcutsOpen(false);
      return true;
    }
    if (detailsOpen) {
      setDetailsOpen(false);
      return true;
    }
    return false;
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" || event.key === "Tab") return;
    event.stopPropagation();
    if (closing || event.altKey || event.ctrlKey || event.metaKey) return;

    const zoomed = zoom.isZoomedNow();
    switch (event.key) {
      case "ArrowLeft":
        if (zoomed) zoom.panBy(PAN_STEP, 0);
        else goTo(-1);
        break;
      case "ArrowRight":
        if (zoomed) zoom.panBy(-PAN_STEP, 0);
        else goTo(1);
        break;
      case "ArrowUp":
        if (!zoomed) return;
        zoom.panBy(0, PAN_STEP);
        break;
      case "ArrowDown":
        if (!zoomed) return;
        zoom.panBy(0, -PAN_STEP);
        break;
      case "Home":
        jumpTo(0);
        break;
      case "End":
        jumpTo(count - 1);
        break;
      case "+":
      case "=":
        zoom.zoomIn();
        break;
      case "-":
      case "_":
        zoom.zoomOut();
        break;
      case "0":
        zoom.reset();
        break;
      case "1":
        zoom.toggleActualSize();
        break;
      case "f":
      case "F":
        fullscreen.toggle();
        break;
      case "i":
      case "I":
        toggleDetails();
        break;
      case "p":
      case "P":
        if (compact) return;
        togglePeekPreference();
        break;
      case "?":
        if (compact) return;
        setShortcutsOpen((value) => !value);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  useImperativeHandle(handleRef, () => ({ handleKeyDown, handleEscape }));

  useEffect(() => {
    if (closing) {
      animate(chrome, 0, { duration: 0.15 });
      return;
    }
    if (reduceMotion) chrome.jump(chromeVisible ? 1 : 0);
    else animate(chrome, chromeVisible ? 1 : 0, { duration: 0.2 });
  }, [chrome, chromeVisible, closing, reduceMotion]);

  return (
    <div className={cn("absolute inset-0 flex flex-col", closing ? "pointer-events-none" : undefined)}>
      <motion.div
        style={{ opacity: chrome }}
        inert={!chromeVisible}
        className="relative z-10 pt-[env(safe-area-inset-top)] max-md:absolute max-md:inset-x-0 max-md:top-0 max-md:bg-linear-to-b max-md:from-black/70 max-md:to-transparent"
      >
        <LightboxToolbar
          slide={slide}
          index={index}
          count={count}
          zoom={zoom}
          showPeekToggle={!compact && count > 1}
          peek={peekPreference}
          onTogglePeek={togglePeekPreference}
          detailsOpen={detailsOpen}
          onToggleDetails={toggleDetails}
          fullscreen={fullscreen}
          onShowShortcuts={() => setShortcutsOpen(true)}
          onClose={onClose}
        />
      </motion.div>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <LightboxStage
            slides={slides}
            position={position}
            generation={generation}
            loop={effectiveLoop}
            peek={peek}
            compact={compact}
            naturalSizes={naturalSizes}
            onNaturalSize={handleNaturalSize}
            zoom={zoom}
            backdrop={backdrop}
            chrome={chrome}
            chromeVisible={chromeVisible}
            closing={closing}
            onExited={onExited}
            onNavigate={goTo}
            onClose={onClose}
            onTap={handleTap}
            getTrigger={getTrigger}
            className="min-h-0 flex-1"
          />
          <motion.div
            style={{ opacity: chrome }}
            inert={!chromeVisible}
            className="relative z-10 flex flex-col gap-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:bg-linear-to-t max-md:from-black/80 max-md:via-black/45 max-md:to-transparent max-md:pt-12"
          >
            <LightboxCaption slide={slide} className="px-4 md:h-16 md:px-6" />
            {count > 1 ? <LightboxFilmstrip slides={slides} index={index} compact={compact} onSelect={jumpTo} /> : null}
          </motion.div>
        </div>
        <LightboxDetails
          open={detailsOpen}
          compact={compact}
          slide={slide}
          naturalSize={slide.size ?? naturalSizes[slide.src]}
          onClose={() => setDetailsOpen(false)}
        />
      </div>

      <AnimatePresence>{shortcutsOpen ? <LightboxShortcuts key="shortcuts" onClose={() => setShortcutsOpen(false)} /> : null}</AnimatePresence>
      <p aria-live="polite" className="sr-only">
        {count > 1 ? t("announce", { current: index + 1, total: count }) : null}
      </p>
    </div>
  );
}

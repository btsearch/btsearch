import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { LightboxCaption } from "./lightboxCaption";
import { LightboxDetails } from "./lightboxDetails";
import { LightboxFilmstrip } from "./lightboxFilmstrip";
import { LightboxShortcuts } from "./lightboxShortcuts";
import { LightboxStage } from "./lightboxStage";
import { LightboxToolbar } from "./lightboxToolbar";
import type { LightboxProps, Size } from "./types";
import { setPeekPreference, usePeekPreference } from "./usePeekPreference";
import { ZOOMED_THRESHOLD, useZoomPan } from "./useZoomPan";
import { useIsMobile } from "@/hooks/useMobile";
import { hasCoarsePointer } from "@/lib/dom/pointer";
import { cn } from "@/lib/utils";

const PAN_STEP = 120;

export type LightboxViewerHandle = {
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  handleEscape: () => boolean;
};

type Props = Omit<LightboxProps, "index"> & {
  index: number;
  closing: boolean;
  onExited: () => void;
  backdrop: MotionValue<number>;
  handleRef: RefObject<LightboxViewerHandle | null>;
};

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function getShareMode(): "share" | "copy" | null {
  if (typeof navigator.share === "function" && hasCoarsePointer()) return "share";
  if (typeof navigator.clipboard?.writeText === "function") return "copy";
  return null;
}

export function LightboxViewer({
  slides,
  index,
  onIndexChange,
  onClose,
  loop = true,
  title,
  actions,
  getTrigger,
  closing,
  onExited,
  backdrop,
  handleRef,
}: Props) {
  const { t } = useTranslation("lightbox");
  const compact = useIsMobile();
  const reduceMotion = useReducedMotion();
  const peekPreference = usePeekPreference();
  const zoom = useZoomPan();
  const chrome = useMotionValue(0);
  const [position, setPosition] = useState(index);
  const [generation, setGeneration] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, Size>>({});
  const enteredFullscreenRef = useRef(false);

  const count = slides.length;
  const effectiveLoop = loop && count > 2;
  if (effectiveLoop ? mod(position, count) !== index : position !== index) {
    setPosition(index);
    setGeneration((value) => value + 1);
  }

  const slide = slides[index];
  const peek = peekPreference && !compact;
  const canFullscreen = document.fullscreenEnabled;
  const shareMode = getShareMode();
  const fitLabel = t("fit");
  const zoomLabel = useTransform(() => {
    const scale = zoom.scale.get();
    const fitRatio = zoom.fitRatio.get();
    return scale <= ZOOMED_THRESHOLD ? fitLabel : `${Math.round(scale * fitRatio * 100)}%`;
  });

  function canNavigate(delta: -1 | 1) {
    if (count < 2) return false;
    return effectiveLoop || (index + delta >= 0 && index + delta < count);
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
    if (effectiveLoop ? mod(target - index, count) === 1 : target === index + 1) {
      goTo(1);
      return;
    }
    if (effectiveLoop ? mod(index - target, count) === 1 : target === index - 1) {
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

  function toggleFullscreen() {
    if (!canFullscreen) return;
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    enteredFullscreenRef.current = true;
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  async function share() {
    const url = new URL(slide.src, window.location.href).href;
    if (shareMode === "share") {
      await navigator.share({ url, title: slide.alt }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
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
        toggleFullscreen();
        break;
      case "i":
      case "I":
        setDetailsOpen((value) => !value);
        break;
      case "p":
      case "P":
        if (compact) return;
        setPeekPreference(!peekPreference);
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

  useLayoutEffect(() => {
    handleRef.current = { handleKeyDown, handleEscape };
    return () => {
      handleRef.current = null;
    };
  });

  useEffect(() => {
    if (closing) {
      animate(chrome, 0, { duration: 0.15 });
      return;
    }
    if (reduceMotion) chrome.jump(chromeVisible ? 1 : 0);
    else animate(chrome, chromeVisible ? 1 : 0, { duration: 0.2 });
  }, [chrome, chromeVisible, closing, reduceMotion]);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      if (enteredFullscreenRef.current && document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

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
          title={title}
          actions={actions?.(slide, index)}
          zoomLabel={zoomLabel}
          onZoomIn={() => zoom.zoomIn()}
          onZoomOut={() => zoom.zoomOut()}
          onToggleActualSize={zoom.toggleActualSize}
          showPeekToggle={!compact && count > 1}
          peek={peekPreference}
          onTogglePeek={() => setPeekPreference(!peekPreference)}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((value) => !value)}
          shareMode={shareMode}
          onShare={() => void share()}
          canFullscreen={canFullscreen}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
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
            {count > 1 ? <LightboxFilmstrip slides={slides} index={index} onSelect={jumpTo} /> : null}
          </motion.div>
        </div>
        <LightboxDetails
          open={detailsOpen}
          compact={compact}
          slide={slide}
          naturalSize={naturalSizes[slide.src]}
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

import { Dialog } from "@base-ui/react/dialog";
import { animate, motion, useMotionValue } from "motion/react";
import { Suspense, lazy, useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { LightboxViewerHandle } from "./lightboxViewer";
import type { LightboxProps, LightboxSlide } from "./types";
import { Spinner } from "@/components/ui/spinner";

const FOCUSABLE_SELECTOR = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const loadViewer = () => import("./lightboxViewer");
const LightboxViewer = lazy(() => loadViewer().then((module) => ({ default: module.LightboxViewer })));

export function preloadLightbox() {
  void loadViewer();
}

function focusTarget(trigger: HTMLElement | null) {
  if (!trigger?.isConnected) return null;
  if (trigger.matches(FOCUSABLE_SELECTOR)) return trigger;
  return trigger.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

export function Lightbox({ slides, index, onIndexChange, onClose, loop, title, actions, getTrigger }: LightboxProps) {
  const { t } = useTranslation("lightbox");
  const [shownIndex, setShownIndex] = useState<number | null>(null);
  const [retainedSlides, setRetainedSlides] = useState<LightboxSlide[]>(slides);
  const backdrop = useMotionValue(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<LightboxViewerHandle | null>(null);
  const finalFocusRef = useRef<HTMLElement | null>(null);

  if (slides.length > 0 && slides !== retainedSlides) setRetainedSlides(slides);
  const displaySlides = slides.length > 0 ? slides : retainedSlides;
  const requestedIndex = index !== null && slides.length > 0 ? Math.min(Math.max(index, 0), slides.length - 1) : null;
  if (requestedIndex !== null && requestedIndex !== shownIndex) setShownIndex(requestedIndex);

  const open = shownIndex !== null && displaySlides.length > 0;
  const closing = open && requestedIndex === null;
  const viewerIndex = shownIndex === null ? 0 : Math.min(shownIndex, displaySlides.length - 1);

  useEffect(() => {
    if (open && !closing) animate(backdrop, 1, { duration: 0.22, ease: "easeOut" });
  }, [backdrop, open, closing]);

  useEffect(() => {
    if (open && !closing) finalFocusRef.current = focusTarget(getTrigger?.(viewerIndex) ?? null);
  });

  function finishClose() {
    backdrop.jump(0);
    setShownIndex(null);
  }

  return (
    <Dialog.Root
      open={open}
      disablePointerDismissal
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) return;
        if (details.reason === "escape-key" && handleRef.current?.handleEscape()) {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup
          ref={popupRef}
          initialFocus={popupRef}
          finalFocus={() => finalFocusRef.current}
          onKeyDown={(event) => handleRef.current?.handleKeyDown(event)}
          className="dark fixed inset-0 z-300 overscroll-none text-foreground outline-none select-none"
        >
          <Dialog.Title className="sr-only">{t("viewer")}</Dialog.Title>
          <motion.div aria-hidden="true" className="absolute inset-0 bg-black/95" style={{ opacity: backdrop }} />
          {open ? (
            <Suspense fallback={<LightboxFallback closing={closing} onExited={finishClose} />}>
              <LightboxViewer
                slides={displaySlides}
                index={viewerIndex}
                onIndexChange={onIndexChange}
                onClose={onClose}
                loop={loop}
                title={title}
                actions={actions}
                getTrigger={getTrigger}
                closing={closing}
                onExited={finishClose}
                backdrop={backdrop}
                handleRef={handleRef}
              />
            </Suspense>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LightboxFallback({ closing, onExited }: { closing: boolean; onExited: () => void }) {
  const notifyExited = useEffectEvent(() => onExited());

  useEffect(() => {
    if (closing) notifyExited();
  }, [closing]);

  return (
    <div className="absolute inset-0 grid place-items-center">
      <Spinner className="size-6 text-white/70" />
    </div>
  );
}

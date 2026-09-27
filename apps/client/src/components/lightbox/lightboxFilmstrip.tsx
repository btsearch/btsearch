import { useVirtualizer } from "@tanstack/react-virtual";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { LightboxSlide } from "./types";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { cn } from "@/lib/utils";

const ACTIVE_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;
const THUMB_SIZE = 56;
const COMPACT_THUMB_SIZE = 44;
const THUMB_GAP = 8;
const STRIP_PADDING = 16;

type Props = {
  slides: LightboxSlide[];
  index: number;
  compact: boolean;
  onSelect: (index: number) => void;
};

export function LightboxFilmstrip({ slides, index, compact, onSelect }: Props) {
  const { t } = useTranslation("lightbox");
  const reduceMotion = useReducedMotion();
  const groupId = useId();
  const attachWheel = useHorizontalScroll<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);
  const thumbSize = compact ? COMPACT_THUMB_SIZE : THUMB_SIZE;

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual requires the compiler's automatic bailout
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: slides.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => thumbSize,
    getItemKey: (slideIndex) => slides[slideIndex].key,
    initialOffset: () => Math.max(0, STRIP_PADDING + index * (thumbSize + THUMB_GAP) + (thumbSize - window.innerWidth) / 2),
    gap: THUMB_GAP,
    paddingStart: STRIP_PADDING,
    paddingEnd: STRIP_PADDING,
    overscan: 6,
  });

  const setScrollElement = useCallback(
    (element: HTMLDivElement | null) => {
      attachWheel(element);
      scrollRef.current = element;
    },
    [attachWheel],
  );

  useEffect(() => {
    virtualizer.scrollToIndex(index, { align: "center", behavior: hasScrolledRef.current && !reduceMotion ? "smooth" : "auto" });
    hasScrolledRef.current = true;
  }, [index, reduceMotion, thumbSize, virtualizer]);

  return (
    <motion.div
      ref={setScrollElement}
      layoutScroll
      className="overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="relative mx-auto h-11 md:h-14" style={{ width: virtualizer.getTotalSize() }}>
        <LayoutGroup id={groupId}>
          {virtualizer.getVirtualItems().map((item) => {
            const slide = slides[item.index];
            const active = item.index === index;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.index)}
                aria-label={t("goToPhoto", { number: item.index + 1 })}
                aria-current={active ? "true" : undefined}
                style={{ transform: `translateX(${item.start}px)` }}
                className={cn(
                  "absolute top-0 left-0 size-11 cursor-pointer overflow-hidden rounded-md bg-white/5 opacity-45 transition-opacity duration-200 outline-none hover:opacity-80 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/70 md:size-14",
                  active && "opacity-100 hover:opacity-100",
                )}
              >
                <img
                  src={slide.thumbSrc ?? slide.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                  draggable={false}
                  className="size-full object-cover"
                />
                {active ? (
                  <motion.span
                    layoutId="lightbox-filmstrip-active"
                    transition={reduceMotion ? { duration: 0 } : ACTIVE_SPRING}
                    className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-white ring-inset"
                  />
                ) : null}
              </button>
            );
          })}
        </LayoutGroup>
      </div>
    </motion.div>
  );
}

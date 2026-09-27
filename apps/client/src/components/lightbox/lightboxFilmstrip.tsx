import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { LightboxSlide } from "./types";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { cn } from "@/lib/utils";

const ACTIVE_SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;

type Props = {
  slides: LightboxSlide[];
  index: number;
  onSelect: (index: number) => void;
  className?: string;
};

export function LightboxFilmstrip({ slides, index, onSelect, className }: Props) {
  const { t } = useTranslation("lightbox");
  const reduceMotion = useReducedMotion();
  const groupId = useId();
  const attachWheel = useHorizontalScroll<HTMLDivElement>();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!container || !active) return;
    const left = active.offsetLeft - (container.clientWidth - active.offsetWidth) / 2;
    container.scrollTo({ left, behavior: hasScrolledRef.current && !reduceMotion ? "smooth" : "instant" });
    hasScrolledRef.current = true;
  }, [index, reduceMotion]);

  return (
    <motion.div
      ref={(element: HTMLDivElement | null) => {
        attachWheel(element);
        containerRef.current = element;
      }}
      layoutScroll
      className={cn(
        "relative flex justify-center-safe gap-2 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <LayoutGroup id={groupId}>
        {slides.map((slide, slideIndex) => {
          const active = slideIndex === index;
          return (
            <button
              key={slide.key}
              type="button"
              onClick={() => onSelect(slideIndex)}
              aria-label={t("goToPhoto", { number: slideIndex + 1 })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-md bg-white/5 opacity-45 transition-opacity duration-200 outline-none hover:opacity-80 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/70 md:size-14",
                active && "opacity-100 hover:opacity-100",
              )}
            >
              <img src={slide.src} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
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
    </motion.div>
  );
}

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import type { LightboxSlide } from "./types";
import { cn } from "@/lib/utils";

export function LightboxCaption({ slide, className }: { slide: LightboxSlide; className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {slide.caption ? (
          <motion.div
            key={slide.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            {slide.caption}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { useCalmTransition } from "../../components/search-overlay/mapFilterMotion";
import { useIsMobile } from "@/hooks/useMobile";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type CrowdCardFrameProps = {
  label: string;
  children: ReactNode;
};

const CARD_SHOWN = { opacity: 1, y: 0 } as const;
const CARD_HIDDEN = { opacity: 0, y: 8 } as const;

export function CrowdCardFrame({ label, children }: CrowdCardFrameProps) {
  const transition = useCalmTransition();
  const { preferences } = usePreferences();
  const isMobile = useIsMobile();
  const sitsAboveFloatingNav = isMobile && preferences.navMode === "floating";

  return (
    <motion.section
      aria-label={label}
      initial={CARD_HIDDEN}
      animate={CARD_SHOWN}
      exit={CARD_HIDDEN}
      transition={transition}
      className={cn(
        "absolute right-4 left-4 z-10 max-h-[min(36rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur-md md:right-auto md:bottom-12 md:w-84",
        sitsAboveFloatingNav ? "bottom-[calc(5.125rem+var(--floating-nav-map-offset,0rem))]" : "bottom-14.5",
      )}
    >
      {children}
    </motion.section>
  );
}

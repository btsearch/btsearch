import { Cancel01Icon, Download04Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { LightboxDetailRow } from "./lightboxDetailRow";
import type { LightboxSlide, Size } from "./types";
import { Button } from "@/components/ui/button";

const PANEL_WIDTH = 320;
const PANEL_SPRING = { type: "spring", stiffness: 420, damping: 42 } as const;

type Props = {
  open: boolean;
  compact: boolean;
  slide: LightboxSlide;
  naturalSize?: Size;
  onClose: () => void;
};

export function LightboxDetails({ open, compact, slide, naturalSize, onClose }: Props) {
  const { t } = useTranslation("lightbox");
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : PANEL_SPRING;
  const originalSrc = slide.fullSrc ?? slide.src;

  const header = (
    <div className="flex h-14 shrink-0 items-center justify-between pr-2 pl-4">
      <h2 className="text-sm font-medium">{t("details")}</h2>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("close")} className="cursor-pointer">
        <HugeiconsIcon icon={Cancel01Icon} aria-hidden="true" />
      </Button>
    </div>
  );

  const content = (
    <div className="flex flex-col gap-4 px-4 pb-4">
      {slide.details}
      {naturalSize ? (
        <LightboxDetailRow label={t("resolution")}>
          <span className="tabular-nums">
            {naturalSize.width} × {naturalSize.height}
          </span>
        </LightboxDetailRow>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="outline" nativeButton={false} render={<a href={originalSrc} target="_blank" rel="noopener noreferrer" />}>
          <HugeiconsIcon icon={LinkSquare02Icon} aria-hidden="true" />
          {t("openOriginal")}
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href={originalSrc} download={slide.downloadName ?? ""} />}>
          <HugeiconsIcon icon={Download04Icon} aria-hidden="true" />
          {t("download")}
        </Button>
      </div>
    </div>
  );

  if (compact)
    return (
      <AnimatePresence>
        {open ? (
          <motion.section
            key="details"
            aria-label={t("details")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={transition}
            className="absolute inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t bg-popover pt-2 pb-[env(safe-area-inset-bottom)] text-popover-foreground"
          >
            <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/40" />
            {header}
            {content}
          </motion.section>
        ) : null}
      </AnimatePresence>
    );

  return (
    <motion.aside
      aria-label={t("details")}
      inert={!open}
      initial={false}
      animate={{ width: open ? PANEL_WIDTH : 0 }}
      transition={transition}
      className="relative shrink-0 overflow-hidden"
    >
      <div className="flex h-full w-80 flex-col border-l bg-background/70">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </div>
    </motion.aside>
  );
}

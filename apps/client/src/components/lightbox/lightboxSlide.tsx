import { ImageNotFound01Icon, ReloadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { type ReelMotion, readReelMotion, reelAppearance } from "./reelLayout";
import type { LightboxSlide, Size } from "./types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type FlightValues = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  clipPath: MotionValue<string>;
};

export type ZoomValues = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
};

type Props = {
  slide: LightboxSlide;
  offset: number;
  registryKey: string;
  size: Size;
  initialX: number;
  isCurrent: boolean;
  reel: ReelMotion;
  backdrop: MotionValue<number>;
  flight: FlightValues;
  zoom: ZoomValues;
  register: (key: string, x: MotionValue<number>) => () => void;
  onNaturalSize: (src: string, size: Size) => void;
};

export function LightboxSlideView({
  slide,
  offset,
  registryKey,
  size,
  initialX,
  isCurrent,
  reel,
  backdrop,
  flight,
  zoom,
  register,
  onNaturalSize,
}: Props) {
  const { t } = useTranslation("lightbox");
  const x = useMotionValue(initialX);
  const scale = useTransform(() => reelAppearance(x.get(), readReelMotion(reel)).scale);
  const opacity = useTransform(() => {
    const appearance = reelAppearance(x.get(), readReelMotion(reel)).opacity;
    return appearance * (isCurrent ? 1 : backdrop.get());
  });
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useLayoutEffect(() => register(registryKey, x), [register, registryKey, x]);

  return (
    <motion.div
      data-lightbox-offset={offset}
      aria-hidden={isCurrent ? undefined : true}
      className="absolute top-1/2 left-1/2"
      style={{
        x,
        scale,
        opacity,
        zIndex: isCurrent ? 1 : 0,
        width: size.width,
        height: size.height,
        marginLeft: -size.width / 2,
        marginTop: -size.height / 2,
      }}
    >
      <motion.div className="size-full" style={isCurrent ? { x: flight.x, y: flight.y, scale: flight.scale } : undefined}>
        <motion.div className="size-full" style={isCurrent ? { x: zoom.x, y: zoom.y, scale: zoom.scale } : undefined}>
          {status === "error" ? null : (
            <motion.img
              key={attempt}
              src={slide.src}
              alt={isCurrent ? slide.alt : ""}
              draggable={false}
              decoding="async"
              fetchPriority={isCurrent ? "high" : "low"}
              onLoad={(event) => {
                const image = event.currentTarget;
                setStatus("loaded");
                onNaturalSize(slide.src, { width: image.naturalWidth, height: image.naturalHeight });
              }}
              onError={() => setStatus("error")}
              className={cn(
                "size-full object-contain transition-opacity duration-200 select-none",
                status === "loaded" ? "opacity-100" : "opacity-0",
              )}
              style={isCurrent ? { clipPath: flight.clipPath } : undefined}
            />
          )}
        </motion.div>
      </motion.div>
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 grid animate-in place-items-center fade-in delay-300 duration-300 fill-mode-both">
          <Spinner className="size-6 text-white/70" />
        </div>
      ) : null}
      {status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          <HugeiconsIcon icon={ImageNotFound01Icon} className="size-8 opacity-60" aria-hidden="true" />
          <span>{t("loadFailed")}</span>
          {isCurrent ? (
            <Button
              variant="outline"
              className="cursor-pointer text-foreground"
              onClick={() => {
                setStatus("loading");
                setAttempt((value) => value + 1);
              }}
            >
              <HugeiconsIcon icon={ReloadIcon} aria-hidden="true" />
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </motion.div>
  );
}

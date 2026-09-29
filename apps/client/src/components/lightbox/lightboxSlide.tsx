import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import { type MotionValue, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { type ReelMotion, readReelMotion, reelAppearance } from "./reelLayout";
import type { LightboxSlide, Size } from "./types";
import type { ZoomController } from "./useZoomPan";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const FULL_RESOLUTION_THRESHOLD = 1.1;
const IMAGE_CLASS = "absolute inset-0 size-full object-contain select-none";

const failedFullSources = new Set<string>();
let fullResolutionLoaded = false;

function canLoadFullResolution(src: string) {
  if (!fullResolutionLoaded && failedFullSources.size >= 2) return false;
  return !failedFullSources.has(src);
}

function markFullResolutionLoaded() {
  fullResolutionLoaded = true;
}

function markFullResolutionFailed(src: string) {
  failedFullSources.add(src);
}

function fadeInClass(loaded: boolean) {
  return cn(IMAGE_CLASS, "transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0");
}

export type FlightValues = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  clipPath: MotionValue<string>;
};

type Props = {
  slide: LightboxSlide;
  offset: number;
  registryKey: string;
  size: Size;
  initialX: number;
  reel: ReelMotion;
  backdrop: MotionValue<number>;
  flight: FlightValues;
  zoom: Pick<ZoomController, "x" | "y" | "scale">;
  register: (key: string, x: MotionValue<number>) => () => void;
  onNaturalSize: (src: string, size: Size) => void;
};

export function LightboxSlideView({ slide, offset, registryKey, size, initialX, reel, backdrop, flight, zoom, register, onNaturalSize }: Props) {
  const { t } = useTranslation("lightbox");
  const isCurrent = offset === 0;
  const isNear = Math.abs(offset) <= 1;
  const fullSrc = slide.fullSrc;
  const x = useMotionValue(initialX);
  const scale = useTransform(() => reelAppearance(x.get(), readReelMotion(reel)).scale);
  const opacity = useTransform(() => {
    const appearance = reelAppearance(x.get(), readReelMotion(reel)).opacity;
    return appearance * (isCurrent ? 1 : backdrop.get());
  });
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [displayRequested, setDisplayRequested] = useState(isNear || slide.thumbSrc === undefined);
  const [displayWidth, setDisplayWidth] = useState(0);
  const [fullRequested, setFullRequested] = useState(false);
  const [fullStatus, setFullStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [prevIsCurrent, setPrevIsCurrent] = useState(isCurrent);

  if (isNear && !displayRequested) setDisplayRequested(true);

  if (isCurrent !== prevIsCurrent) {
    setPrevIsCurrent(isCurrent);
    setFullRequested(false);
    setFullStatus("loading");
  }

  function needsFullResolution(zoomScale: number, naturalWidth: number) {
    if (fullRequested || !isCurrent || fullSrc === undefined || naturalWidth <= 0 || !canLoadFullResolution(fullSrc)) return false;
    return size.width * zoomScale * window.devicePixelRatio > naturalWidth * FULL_RESOLUTION_THRESHOLD;
  }

  if (needsFullResolution(1, displayWidth)) setFullRequested(true);

  useMotionValueEvent(zoom.scale, "change", (zoomScale) => {
    if (needsFullResolution(zoomScale, displayWidth)) setFullRequested(true);
  });

  useLayoutEffect(() => register(registryKey, x), [register, registryKey, x]);

  const clip = isCurrent ? { clipPath: flight.clipPath } : undefined;

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
        <motion.div className="relative size-full" style={isCurrent ? { x: zoom.x, y: zoom.y, scale: zoom.scale } : undefined}>
          {status === "error" ? null : (
            <>
              {slide.thumbSrc !== undefined ? (
                <motion.img
                  src={slide.thumbSrc}
                  alt=""
                  draggable={false}
                  fetchPriority={isCurrent ? "high" : "low"}
                  className={IMAGE_CLASS}
                  style={clip}
                />
              ) : null}
              {displayRequested ? (
                <motion.img
                  src={slide.src}
                  alt={isCurrent ? slide.alt : ""}
                  draggable={false}
                  decoding="async"
                  fetchPriority={isCurrent ? "high" : "low"}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    setStatus("loaded");
                    setDisplayWidth(image.naturalWidth);
                    if (needsFullResolution(zoom.scale.get(), image.naturalWidth)) setFullRequested(true);
                    if (slide.size === undefined) onNaturalSize(slide.src, { width: image.naturalWidth, height: image.naturalHeight });
                  }}
                  onError={() => setStatus("error")}
                  className={fadeInClass(status === "loaded")}
                  style={clip}
                />
              ) : null}
              {fullRequested && fullStatus !== "error" && fullSrc !== undefined ? (
                <motion.img
                  src={fullSrc}
                  alt=""
                  draggable={false}
                  decoding="async"
                  onLoad={() => {
                    markFullResolutionLoaded();
                    setFullStatus("loaded");
                  }}
                  onError={() => {
                    markFullResolutionFailed(fullSrc);
                    setFullStatus("error");
                  }}
                  className={fadeInClass(fullStatus === "loaded")}
                  style={clip}
                />
              ) : null}
            </>
          )}
        </motion.div>
      </motion.div>
      {status === "loading" && displayRequested ? (
        <div className="pointer-events-none absolute inset-0 grid animate-in place-items-center fade-in delay-300 duration-300 fill-mode-both">
          <Spinner className="size-6 text-white/70" />
        </div>
      ) : null}
      {status === "error" ? (
        <ErrorState
          className="absolute inset-0 min-h-0 p-4"
          icon={ImageNotFound01Icon}
          title={t("loadFailed")}
          description={null}
          onRetry={isCurrent ? () => setStatus("loading") : undefined}
        />
      ) : null}
    </motion.div>
  );
}

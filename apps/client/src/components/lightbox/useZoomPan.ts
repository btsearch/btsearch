import { type AnimationPlaybackControls, animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";

export const MAX_ZOOM = 5;
export const ZOOMED_THRESHOLD = 1.01;
const DOUBLE_TAP_ZOOM = 2.5;
const ZOOM_STEP = 1.5;
const RUBBER_BAND = 0.35;
const ZOOM_SPRING = { type: "spring", stiffness: 380, damping: 38 } as const;
const PAN_INERTIA = { power: 0.3, timeConstant: 260, bounceStiffness: 380, bounceDamping: 36, restDelta: 0.5 } as const;

export type Point = { x: number; y: number };

export type ZoomBounds = {
  fitWidth: number;
  fitHeight: number;
  stageWidth: number;
  stageHeight: number;
  naturalWidth: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rubberBand(value: number, min: number, max: number) {
  if (value < min) return min - (min - value) * RUBBER_BAND;
  if (value > max) return max + (value - max) * RUBBER_BAND;
  return value;
}

export function useZoomPan() {
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const fitRatio = useMotionValue(1);
  const reduceMotion = useReducedMotion();
  const [isZoomed, setIsZoomed] = useState(false);
  const boundsRef = useRef<ZoomBounds>({ fitWidth: 0, fitHeight: 0, stageWidth: 0, stageHeight: 0, naturalWidth: 0 });
  const targetScaleRef = useRef(1);
  const animationsRef = useRef<AnimationPlaybackControls[]>([]);

  useMotionValueEvent(scale, "change", (value) => setIsZoomed(value > ZOOMED_THRESHOLD));

  function stop() {
    for (const animation of animationsRef.current) animation.stop();
    animationsRef.current = [];
    x.stop();
    y.stop();
  }

  function limits(targetScale: number) {
    const { fitWidth, fitHeight, stageWidth, stageHeight } = boundsRef.current;
    return {
      x: Math.max(0, (fitWidth * targetScale - stageWidth) / 2),
      y: Math.max(0, (fitHeight * targetScale - stageHeight) / 2),
    };
  }

  function zoomTo(nextScale: number, anchor: Point = { x: 0, y: 0 }, animated = true) {
    const target = clamp(nextScale, 1, MAX_ZOOM);
    const from = { scale: scale.get(), x: x.get(), y: y.get() };
    const bounds = limits(target);
    const ratio = target / from.scale;
    const toX = target <= 1 ? 0 : clamp(anchor.x - (anchor.x - from.x) * ratio, -bounds.x, bounds.x);
    const toY = target <= 1 ? 0 : clamp(anchor.y - (anchor.y - from.y) * ratio, -bounds.y, bounds.y);

    stop();
    targetScaleRef.current = target;
    if (!animated || reduceMotion) {
      scale.set(target);
      x.set(toX);
      y.set(toY);
      return;
    }

    animationsRef.current = [
      animate(0, 1, {
        ...ZOOM_SPRING,
        onUpdate: (progress) => {
          scale.set(from.scale + (target - from.scale) * progress);
          x.set(from.x + (toX - from.x) * progress);
          y.set(from.y + (toY - from.y) * progress);
        },
      }),
    ];
  }

  function zoomBy(factor: number, anchor?: Point, animated = true) {
    zoomTo(targetScaleRef.current * factor, anchor, animated);
  }

  function actualSizeScale() {
    const { fitWidth, naturalWidth } = boundsRef.current;
    return fitWidth > 0 && naturalWidth > 0 ? naturalWidth / fitWidth : 1;
  }

  function toggleActualSize() {
    const actual = actualSizeScale();
    if (actual <= ZOOMED_THRESHOLD || Math.abs(targetScaleRef.current - actual) < 0.01) zoomTo(1);
    else zoomTo(actual);
  }

  function toggleZoomAt(anchor: Point) {
    if (targetScaleRef.current > ZOOMED_THRESHOLD) zoomTo(1);
    else zoomTo(DOUBLE_TAP_ZOOM, anchor);
  }

  function panBy(deltaX: number, deltaY: number) {
    const bounds = limits(scale.get());
    const toX = clamp(x.get() + deltaX, -bounds.x, bounds.x);
    const toY = clamp(y.get() + deltaY, -bounds.y, bounds.y);
    stop();
    if (reduceMotion) {
      x.set(toX);
      y.set(toY);
      return;
    }
    animationsRef.current = [animate(x, toX, ZOOM_SPRING), animate(y, toY, ZOOM_SPRING)];
  }

  function beginGesture() {
    stop();
    return { scale: scale.get(), x: x.get(), y: y.get() };
  }

  function setTransform(nextScale: number, nextX: number, nextY: number) {
    targetScaleRef.current = nextScale;
    scale.set(nextScale);
    x.set(nextX);
    y.set(nextY);
  }

  function panTo(nextX: number, nextY: number) {
    const bounds = limits(scale.get());
    x.set(rubberBand(nextX, -bounds.x, bounds.x));
    y.set(rubberBand(nextY, -bounds.y, bounds.y));
  }

  function releasePan() {
    const bounds = limits(scale.get());
    stop();
    if (reduceMotion) {
      x.set(clamp(x.get(), -bounds.x, bounds.x));
      y.set(clamp(y.get(), -bounds.y, bounds.y));
      return;
    }
    // Motion skips animations whose target equals the current value; inertia ignores the target, so any other value works
    animationsRef.current = [
      animate(x, x.get() + 1, { type: "inertia", velocity: x.getVelocity(), min: -bounds.x, max: bounds.x, ...PAN_INERTIA }),
      animate(y, y.get() + 1, { type: "inertia", velocity: y.getVelocity(), min: -bounds.y, max: bounds.y, ...PAN_INERTIA }),
    ];
  }

  function settle(anchor: Point) {
    const current = scale.get();
    if (current < 1 || current > MAX_ZOOM) {
      zoomTo(current, anchor);
      return;
    }

    targetScaleRef.current = current;
    const bounds = limits(current);
    const toX = clamp(x.get(), -bounds.x, bounds.x);
    const toY = clamp(y.get(), -bounds.y, bounds.y);
    if (toX === x.get() && toY === y.get()) return;
    stop();
    if (reduceMotion) {
      x.set(toX);
      y.set(toY);
      return;
    }
    animationsRef.current = [animate(x, toX, ZOOM_SPRING), animate(y, toY, ZOOM_SPRING)];
  }

  function setBounds(bounds: ZoomBounds) {
    const previous = boundsRef.current;
    if (
      previous.fitWidth === bounds.fitWidth &&
      previous.fitHeight === bounds.fitHeight &&
      previous.stageWidth === bounds.stageWidth &&
      previous.stageHeight === bounds.stageHeight &&
      previous.naturalWidth === bounds.naturalWidth
    )
      return;

    boundsRef.current = bounds;
    fitRatio.set(bounds.naturalWidth > 0 ? bounds.fitWidth / bounds.naturalWidth : 1);
    if (scale.get() <= ZOOMED_THRESHOLD) return;
    const panLimits = limits(scale.get());
    x.set(clamp(x.get(), -panLimits.x, panLimits.x));
    y.set(clamp(y.get(), -panLimits.y, panLimits.y));
  }

  return {
    scale,
    x,
    y,
    fitRatio,
    isZoomed,
    isZoomedNow: () => scale.get() > ZOOMED_THRESHOLD,
    zoomTo,
    zoomIn: (anchor?: Point) => zoomBy(ZOOM_STEP, anchor),
    zoomOut: (anchor?: Point) => zoomBy(1 / ZOOM_STEP, anchor),
    zoomBy,
    reset: (animated = true) => zoomTo(1, undefined, animated),
    toggleActualSize,
    toggleZoomAt,
    panBy,
    beginGesture,
    setTransform,
    panTo,
    releasePan,
    settle,
    setBounds,
  };
}

export type ZoomController = ReturnType<typeof useZoomPan>;

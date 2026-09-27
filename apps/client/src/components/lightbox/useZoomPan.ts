import { type AnimationPlaybackControls, animate, clamp, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";

import { shallowEqual } from "@/lib/shallowEqual";

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

  function clampPan(point: Point, targetScale: number): Point {
    const limit = limits(targetScale);
    return { x: clamp(-limit.x, limit.x, point.x), y: clamp(-limit.y, limit.y, point.y) };
  }

  function setPan(point: Point) {
    x.set(point.x);
    y.set(point.y);
  }

  function springPan(to: Point) {
    stop();
    if (reduceMotion) {
      setPan(to);
      return;
    }
    animationsRef.current = [animate(x, to.x, ZOOM_SPRING), animate(y, to.y, ZOOM_SPRING)];
  }

  function zoomTo(nextScale: number, anchor: Point = { x: 0, y: 0 }, animated = true) {
    const target = clamp(1, MAX_ZOOM, nextScale);
    const from = { scale: scale.get(), x: x.get(), y: y.get() };
    const ratio = target / from.scale;
    const anchoredPan = { x: anchor.x - (anchor.x - from.x) * ratio, y: anchor.y - (anchor.y - from.y) * ratio };
    const to = target <= 1 ? { x: 0, y: 0 } : clampPan(anchoredPan, target);

    stop();
    targetScaleRef.current = target;
    if (!animated || reduceMotion) {
      scale.set(target);
      setPan(to);
      return;
    }

    animationsRef.current = [
      animate(0, 1, {
        ...ZOOM_SPRING,
        onUpdate: (progress) => {
          scale.set(from.scale + (target - from.scale) * progress);
          x.set(from.x + (to.x - from.x) * progress);
          y.set(from.y + (to.y - from.y) * progress);
        },
      }),
    ];
  }

  function zoomBy(factor: number, anchor?: Point) {
    zoomTo(targetScaleRef.current * factor, anchor);
  }

  function actualSizeScale() {
    const { fitWidth, naturalWidth } = boundsRef.current;
    return fitWidth > 0 && naturalWidth > 0 ? naturalWidth / fitWidth : 1;
  }

  function toggleActualSize() {
    const actual = Math.min(actualSizeScale(), MAX_ZOOM);
    if (actual <= ZOOMED_THRESHOLD || Math.abs(targetScaleRef.current - actual) < 0.01) zoomTo(1);
    else zoomTo(actual);
  }

  function toggleZoomAt(anchor: Point) {
    if (targetScaleRef.current > ZOOMED_THRESHOLD) zoomTo(1);
    else zoomTo(DOUBLE_TAP_ZOOM, anchor);
  }

  function panBy(deltaX: number, deltaY: number) {
    springPan(clampPan({ x: x.get() + deltaX, y: y.get() + deltaY }, scale.get()));
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
    const limit = limits(scale.get());
    x.set(rubberBand(nextX, -limit.x, limit.x));
    y.set(rubberBand(nextY, -limit.y, limit.y));
  }

  function releasePan() {
    const limit = limits(scale.get());
    stop();
    if (reduceMotion) {
      setPan(clampPan({ x: x.get(), y: y.get() }, scale.get()));
      return;
    }
    // Motion skips animations whose target equals the current value; inertia ignores the target, so any other value works
    animationsRef.current = [
      animate(x, x.get() + 1, { type: "inertia", velocity: x.getVelocity(), min: -limit.x, max: limit.x, ...PAN_INERTIA }),
      animate(y, y.get() + 1, { type: "inertia", velocity: y.getVelocity(), min: -limit.y, max: limit.y, ...PAN_INERTIA }),
    ];
  }

  function settle(anchor: Point) {
    const current = scale.get();
    if (current < 1 || current > MAX_ZOOM) {
      zoomTo(current, anchor);
      return;
    }

    targetScaleRef.current = current;
    const to = clampPan({ x: x.get(), y: y.get() }, current);
    if (to.x !== x.get() || to.y !== y.get()) springPan(to);
  }

  function setBounds(bounds: ZoomBounds) {
    if (shallowEqual(boundsRef.current, bounds)) return;
    boundsRef.current = bounds;
    fitRatio.set(bounds.naturalWidth > 0 ? bounds.fitWidth / bounds.naturalWidth : 1);
    if (scale.get() > ZOOMED_THRESHOLD) setPan(clampPan({ x: x.get(), y: y.get() }, scale.get()));
  }

  return {
    scale,
    x,
    y,
    fitRatio,
    isZoomed,
    isZoomedNow: () => scale.get() > ZOOMED_THRESHOLD,
    zoomTo,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
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

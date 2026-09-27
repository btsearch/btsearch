import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AnimatePresence,
  type AnimationPlaybackControls,
  type MotionValue,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LightboxMinimap } from "./lightboxMinimap";
import { type FlightValues, LightboxSlideView } from "./lightboxSlide";
import { REEL_PARAM_KEYS, type ReelParams, computeReel, createReelMotion, fitSize } from "./reelLayout";
import type { LightboxSlide, Size } from "./types";
import { MAX_ZOOM, type Point, type ZoomController } from "./useZoomPan";
import { Button } from "@/components/ui/button";
import { isInteractiveTarget } from "@/lib/dom/keyboard";
import { cn } from "@/lib/utils";

const SLIDE_SPRING = { type: "spring", stiffness: 340, damping: 36, mass: 0.9 } as const;
const FLIGHT_TRANSITION = { type: "spring", bounce: 0, duration: 0.42 } as const;
const DESKTOP_GUTTER = 72;
const DESKTOP_VERTICAL_PADDING = 12;
const DRAG_THRESHOLD = 8;
const DOUBLE_TAP_MS = 260;
const SWIPE_VELOCITY = 450;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 650;
const PINCH_CLOSE_SCALE = 0.7;
const WHEEL_NAVIGATION_DISTANCE = 60;

type PendingGesture = { kind: "pending"; startX: number; startY: number; pointerType: string; offset: number | null; afterPinch: boolean };
type SwipeGesture = { kind: "swipe"; startX: number; delta: number; bases: Map<string, number> };
type DismissGesture = { kind: "dismiss"; startY: number; delta: number };
type PanGesture = { kind: "pan"; startX: number; startY: number; originX: number; originY: number };
type PinchGesture = { kind: "pinch"; startDistance: number; startScale: number; originX: number; originY: number; center: Point; lastCenter: Point };
type Gesture = PendingGesture | SwipeGesture | DismissGesture | PanGesture | PinchGesture | { kind: "ignored" };

type RegistryEntry = { x: MotionValue<number>; target: number };

type AppliedLayout = { position: number; generation: number; width: number; height: number; fade: number; params: ReelParams };

type FlightState = { x: number; y: number; scale: number; insetX: number; insetY: number; radius: number };

const IDENTITY_FLIGHT: FlightState = { x: 0, y: 0, scale: 1, insetX: 0, insetY: 0, radius: 0 };

function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function findTriggerImage(trigger: HTMLElement | null) {
  if (!trigger?.isConnected) return null;
  if (trigger instanceof HTMLImageElement) return trigger;
  return trigger.querySelector("img");
}

function isOnScreen(rect: DOMRect) {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function flightFromTrigger(image: HTMLImageElement, trigger: HTMLElement, fitted: Size, stageRect: DOMRect): FlightState {
  const rect = image.getBoundingClientRect();
  const imageStyle = getComputedStyle(image);
  const cover = imageStyle.objectFit === "cover";
  const scale = cover
    ? Math.max(rect.width / fitted.width, rect.height / fitted.height)
    : Math.min(rect.width / fitted.width, rect.height / fitted.height);
  const radius = Number.parseFloat(imageStyle.borderTopLeftRadius) || Number.parseFloat(getComputedStyle(trigger).borderTopLeftRadius) || 0;

  return {
    x: rect.left + rect.width / 2 - (stageRect.left + stageRect.width / 2),
    y: rect.top + rect.height / 2 - (stageRect.top + stageRect.height / 2),
    scale,
    insetX: cover ? Math.max(0, (fitted.width - rect.width / scale) / 2) : 0,
    insetY: cover ? Math.max(0, (fitted.height - rect.height / scale) / 2) : 0,
    radius: radius / scale,
  };
}

function mixFlight(from: FlightState, to: FlightState, progress: number): FlightState {
  const mix = (start: number, end: number) => start + (end - start) * progress;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    scale: mix(from.scale, to.scale),
    insetX: mix(from.insetX, to.insetX),
    insetY: mix(from.insetY, to.insetY),
    radius: mix(from.radius, to.radius),
  };
}

type Props = {
  slides: LightboxSlide[];
  position: number;
  generation: number;
  loop: boolean;
  peek: boolean;
  compact: boolean;
  naturalSizes: Record<string, Size>;
  onNaturalSize: (src: string, size: Size) => void;
  zoom: ZoomController;
  backdrop: MotionValue<number>;
  chrome: MotionValue<number>;
  chromeVisible: boolean;
  closing: boolean;
  onExited: () => void;
  onNavigate: (delta: -1 | 1) => void;
  onClose: () => void;
  onTap: () => void;
  getTrigger?: (index: number) => HTMLElement | null;
  className?: string;
};

export function LightboxStage({
  slides,
  position,
  generation,
  loop,
  peek,
  compact,
  naturalSizes,
  onNaturalSize,
  zoom,
  backdrop,
  chrome,
  chromeVisible,
  closing,
  onExited,
  onNavigate,
  onClose,
  onTap,
  getTrigger,
  className,
}: Props) {
  const { t } = useTranslation("lightbox");
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<Size>({ width: 0, height: 0 });
  const registryRef = useRef(new Map<string, RegistryEntry>());
  const [reelMotion] = useState(createReelMotion);
  const appliedRef = useRef<AppliedLayout | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const wheelRef = useRef({ accumulated: 0, locked: false, timer: 0 });
  const fade = useMotionValue(0);
  const maskImage = useMotionTemplate`linear-gradient(to right, transparent 0px, #000 ${fade}px, #000 calc(100% - ${fade}px), transparent 100%)`;
  const dismissY = useMotionValue(0);
  const dismissScale = useTransform(dismissY, [0, 800], [1, 0.7]);
  const reelOpacity = useMotionValue(1);
  const flightX = useMotionValue(0);
  const flightY = useMotionValue(0);
  const flightScale = useMotionValue(1);
  const flightClip = useMotionValue("none");
  const flightAnimationRef = useRef<AnimationPlaybackControls | null>(null);
  const flightStateRef = useRef<FlightState>(IDENTITY_FLIGHT);

  const count = slides.length;
  const index = mod(position, count);
  const current = slides[index];
  const gutterX = compact ? 0 : DESKTOP_GUTTER;
  const gutterY = compact ? 0 : DESKTOP_VERTICAL_PADDING;
  const box: Size = { width: Math.max(0, stageSize.width - gutterX * 2), height: Math.max(0, stageSize.height - gutterY * 2) };

  const items: { offset: number; virtual: number; slide: LightboxSlide; size: Size }[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const virtual = position + offset;
    if (offset !== 0 && count < 2) continue;
    if (!loop && (virtual < 0 || virtual >= count)) continue;
    const slide = slides[mod(virtual, count)];
    items.push({ offset, virtual, slide, size: fitSize(slide.size ?? naturalSizes[slide.src], box) });
  }

  const currentSize = items.find((item) => item.offset === 0)?.size ?? { width: 0, height: 0 };
  const reel = computeReel(new Map(items.map((item) => [item.offset, item.size.width])), stageSize.width, peek, !zoom.isZoomed);
  const fadeTarget = zoom.isZoomed ? 0 : reel.fade;
  const flight: FlightValues = { x: flightX, y: flightY, scale: flightScale, clipPath: flightClip };
  const zoomValues = { x: zoom.x, y: zoom.y, scale: zoom.scale };

  const register = useCallback((key: string, x: MotionValue<number>) => {
    const entry: RegistryEntry = { x, target: x.get() };
    registryRef.current.set(key, entry);
    return () => {
      if (registryRef.current.get(key) === entry) registryRef.current.delete(key);
    };
  }, []);

  function canNavigate(delta: -1 | 1) {
    if (count < 2) return false;
    return loop || (index + delta >= 0 && index + delta < count);
  }

  function toStagePoint(clientX: number, clientY: number): Point {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  function cancelTapTimer() {
    if (tapTimerRef.current === null) return;
    window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = null;
  }

  function applyFlight(state: FlightState) {
    flightStateRef.current = state;
    flightX.set(state.x);
    flightY.set(state.y);
    flightScale.set(state.scale);
    flightClip.set(`inset(${state.insetY}px ${state.insetX}px round ${state.radius}px)`);
  }

  function stopFlight() {
    flightAnimationRef.current?.stop();
    flightAnimationRef.current = null;
    flightScale.stop();
    reelOpacity.stop();
  }

  function animateFlight(from: FlightState, to: FlightState) {
    stopFlight();
    const controls = animate(0, 1, { ...FLIGHT_TRANSITION, onUpdate: (progress) => applyFlight(mixFlight(from, to, progress)) });
    flightAnimationRef.current = controls;
    return controls;
  }

  function moveValue(value: MotionValue<number>, target: number, animated: boolean) {
    if (!reduceMotion && (animated || value.isAnimating())) animate(value, target, SLIDE_SPRING);
    else value.jump(target);
  }

  function settleReel() {
    for (const item of items) {
      const entry = registryRef.current.get(`${generation}:${item.virtual}`);
      if (!entry) continue;
      entry.target = reel.targets.get(item.offset) ?? 0;
      moveValue(entry.x, entry.target, true);
    }
  }

  function restoreDismiss() {
    if (reduceMotion) dismissY.jump(0);
    else animate(dismissY, 0, SLIDE_SPRING);
    animate(backdrop, 1, { duration: 0.2 });
    animate(chrome, chromeVisible ? 1 : 0, { duration: 0.2 });
  }

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setStageSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    zoom.setBounds({
      fitWidth: currentSize.width,
      fitHeight: currentSize.height,
      stageWidth: stageSize.width,
      stageHeight: stageSize.height,
      naturalWidth: (current.size ?? naturalSizes[current.src])?.width ?? currentSize.width,
    });
    if (stageSize.width === 0 || stageSize.height === 0) return;

    const applied = appliedRef.current;
    const structural =
      applied !== null && (applied.position !== position || applied.generation !== generation || applied.params.peek !== reel.params.peek);
    const resizedOnly = !structural && applied !== null && (applied.width !== stageSize.width || applied.height !== stageSize.height);
    const animated = applied !== null && !resizedOnly;
    if (applied === null || applied.fade !== fadeTarget) moveValue(fade, fadeTarget, animated);
    for (const key of REEL_PARAM_KEYS) {
      if (applied === null || applied.params[key] !== reel.params[key]) moveValue(reelMotion[key], reel.params[key], animated);
    }
    appliedRef.current = { position, generation, width: stageSize.width, height: stageSize.height, fade: fadeTarget, params: reel.params };
    if (gestureRef.current?.kind === "swipe") return;

    for (const item of items) {
      const entry = registryRef.current.get(`${generation}:${item.virtual}`);
      if (!entry) continue;
      const target = reel.targets.get(item.offset) ?? 0;
      if (entry.target === target) continue;
      entry.target = target;
      moveValue(entry.x, target, animated);
    }
  });

  const runEnter = useEffectEvent(() => {
    const stage = stageRef.current;
    if (!stage || reduceMotion) return;

    const trigger = getTrigger?.(index) ?? null;
    const image = findTriggerImage(trigger);
    if (trigger && image && image.naturalWidth > 0 && isOnScreen(image.getBoundingClientRect())) {
      const stageRect = stage.getBoundingClientRect();
      const known = current.size ?? naturalSizes[current.src];
      const natural = known ?? { width: image.naturalWidth, height: image.naturalHeight };
      const fitted = fitSize(natural, {
        width: Math.max(0, stageRect.width - gutterX * 2),
        height: Math.max(0, stageRect.height - gutterY * 2),
      });
      if (fitted.width > 0) {
        if (!known) onNaturalSize(current.src, natural);
        const from = flightFromTrigger(image, trigger, fitted, stageRect);
        applyFlight(from);
        void animateFlight(from, IDENTITY_FLIGHT).finished.then(() => flightClip.set("none"));
        return;
      }
    }

    flightScale.set(0.94);
    reelOpacity.set(0);
    animate(flightScale, 1, FLIGHT_TRANSITION);
    animate(reelOpacity, 1, { duration: 0.2, ease: "easeOut" });
  });

  const runExit = useEffectEvent(async () => {
    gestureRef.current = null;
    cancelTapTimer();
    stopFlight();
    const backdropFade = animate(backdrop, 0, { duration: reduceMotion ? 0.12 : 0.26, ease: "easeOut" }).finished;
    if (reduceMotion) {
      await Promise.all([backdropFade, animate(reelOpacity, 0, { duration: 0.12 }).finished]);
      return;
    }

    if (Math.abs(dismissY.get()) > 4) {
      await Promise.all([
        backdropFade,
        animate(dismissY, dismissY.get() + stageSize.height * 0.35, { duration: 0.24, ease: "easeIn" }).finished,
        animate(reelOpacity, 0, { duration: 0.22 }).finished,
      ]);
      return;
    }

    const zoomedNow = Math.abs(zoom.scale.get() - 1) > 0.01;
    const trigger = zoomedNow ? null : (getTrigger?.(index) ?? null);
    const image = findTriggerImage(trigger);
    const stage = stageRef.current;
    if (stage && trigger && image && currentSize.width > 0 && isOnScreen(image.getBoundingClientRect())) {
      const target = flightFromTrigger(image, trigger, currentSize, stage.getBoundingClientRect());
      await Promise.all([backdropFade, animateFlight(flightStateRef.current, target).finished]);
      return;
    }

    await Promise.all([backdropFade, animate(reelOpacity, 0, { duration: 0.2 }).finished, animate(flightScale, 0.94, { duration: 0.2 }).finished]);
  });

  const restoreAfterReopen = useEffectEvent(() => {
    stopFlight();
    dismissY.jump(0);
    reelOpacity.jump(1);
    applyFlight(IDENTITY_FLIGHT);
    flightClip.set("none");
  });

  const notifyExited = useEffectEvent(() => onExited());

  useLayoutEffect(() => {
    runEnter();
  }, []);

  useEffect(() => {
    if (!closing) return;
    let cancelled = false;
    void runExit().then(() => {
      if (!cancelled) notifyExited();
    });
    return () => {
      cancelled = true;
      restoreAfterReopen();
    };
  }, [closing]);

  const handleWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    if (closing) return;

    if (!zoom.isZoomedNow() && !event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const state = wheelRef.current;
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(() => {
        state.accumulated = 0;
        state.locked = false;
      }, 180);
      if (state.locked) return;
      state.accumulated += event.deltaX;
      if (Math.abs(state.accumulated) < WHEEL_NAVIGATION_DISTANCE) return;
      const direction = state.accumulated > 0 ? 1 : -1;
      state.accumulated = 0;
      state.locked = true;
      if (canNavigate(direction)) onNavigate(direction);
      return;
    }

    const lineHeight = event.deltaMode === 1 ? 16 : 1;
    const delta = event.deltaMode === 2 ? event.deltaY * stageSize.height : event.deltaY * lineHeight;
    const anchor = toStagePoint(event.clientX, event.clientY);
    if (event.ctrlKey) zoom.zoomTo(zoom.scale.get() * Math.exp(-delta * 0.01), anchor, false);
    else zoom.zoomBy(Math.exp(-delta * 0.0025), anchor);
  });

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const listener = (event: WheelEvent) => handleWheel(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, []);

  useEffect(() => {
    const wheelState = wheelRef.current;
    return () => {
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
      window.clearTimeout(wheelState.timer);
    };
  }, []);

  function resolvePending(gesture: PendingGesture, clientX: number, clientY: number): Gesture {
    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    if (zoom.isZoomedNow()) {
      const origin = zoom.beginGesture();
      return { kind: "pan", startX: gesture.startX, startY: gesture.startY, originX: origin.x, originY: origin.y };
    }
    if (gesture.afterPinch) return { kind: "ignored" };

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (count < 2) return { kind: "ignored" };
      const bases = new Map<string, number>();
      for (const [key, entry] of registryRef.current) {
        entry.x.stop();
        bases.set(key, entry.x.get());
      }
      return { kind: "swipe", startX: gesture.startX, delta: 0, bases };
    }

    if (deltaY > 0 && gesture.pointerType !== "mouse") {
      dismissY.stop();
      return { kind: "dismiss", startY: gesture.startY, delta: 0 };
    }
    return { kind: "ignored" };
  }

  function startPinch() {
    const [first, second] = [...pointersRef.current.values()];
    const previous = gestureRef.current;
    if (previous?.kind === "swipe") settleReel();
    if (previous?.kind === "dismiss") restoreDismiss();
    cancelTapTimer();
    lastTapRef.current = null;

    const origin = zoom.beginGesture();
    const center = toStagePoint((first.x + second.x) / 2, (first.y + second.y) / 2);
    gestureRef.current = {
      kind: "pinch",
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      startScale: origin.scale,
      originX: origin.x,
      originY: origin.y,
      center,
      lastCenter: center,
    };
  }

  function updatePinch(gesture: PinchGesture) {
    const [first, second] = [...pointersRef.current.values()];
    if (!first || !second) return;
    const center = toStagePoint((first.x + second.x) / 2, (first.y + second.y) / 2);
    let nextScale = gesture.startScale * (Math.hypot(second.x - first.x, second.y - first.y) / gesture.startDistance);
    if (nextScale < 1) nextScale = 1 - (1 - nextScale) * 0.55;
    else if (nextScale > MAX_ZOOM) nextScale = MAX_ZOOM + (nextScale - MAX_ZOOM) * 0.3;
    const ratio = nextScale / gesture.startScale;
    gestureRef.current = { ...gesture, lastCenter: center };
    zoom.setTransform(nextScale, center.x - (gesture.center.x - gesture.originX) * ratio, center.y - (gesture.center.y - gesture.originY) * ratio);
  }

  function endPinch(gesture: PinchGesture) {
    if (zoom.scale.get() < PINCH_CLOSE_SCALE) {
      gestureRef.current = null;
      onClose();
      return;
    }

    zoom.settle(gesture.lastCenter);
    const [remaining] = [...pointersRef.current.values()];
    gestureRef.current = remaining
      ? { kind: "pending", startX: remaining.x, startY: remaining.y, pointerType: "touch", offset: null, afterPinch: true }
      : null;
  }

  function endSwipe(gesture: SwipeGesture, cancelled: boolean) {
    const velocity = registryRef.current.get(`${generation}:${position}`)?.x.getVelocity() ?? 0;
    const threshold = Math.min(stageSize.width * 0.18, 140);
    let direction: -1 | 0 | 1 = 0;
    if (!cancelled && (gesture.delta < -threshold || (velocity < -SWIPE_VELOCITY && gesture.delta < 0))) direction = 1;
    else if (!cancelled && (gesture.delta > threshold || (velocity > SWIPE_VELOCITY && gesture.delta > 0))) direction = -1;

    if (direction !== 0 && canNavigate(direction)) {
      onNavigate(direction);
      return;
    }
    settleReel();
  }

  function endDismiss(gesture: DismissGesture, cancelled: boolean) {
    const velocity = dismissY.getVelocity();
    if (!cancelled && (gesture.delta > DISMISS_DISTANCE || (velocity > DISMISS_VELOCITY && gesture.delta > 0))) {
      onClose();
      return;
    }
    restoreDismiss();
  }

  function handleTap(event: ReactPointerEvent<HTMLDivElement>, gesture: PendingGesture) {
    if (gesture.afterPinch) return;
    if ((gesture.offset === -1 || gesture.offset === 1) && reel.params.peek > 0 && reel.params.visibility > 0) {
      lastTapRef.current = null;
      cancelTapTimer();
      onNavigate(gesture.offset);
      return;
    }

    const last = lastTapRef.current;
    if (last && event.timeStamp - last.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30) {
      lastTapRef.current = null;
      cancelTapTimer();
      zoom.toggleZoomAt(toStagePoint(event.clientX, event.clientY));
      return;
    }

    lastTapRef.current = { time: event.timeStamp, x: event.clientX, y: event.clientY };
    if (gesture.pointerType === "mouse") return;
    cancelTapTimer();
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      onTap();
    }, DOUBLE_TAP_MS);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (closing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isInteractiveTarget(event.target, event.currentTarget)) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      startPinch();
      return;
    }
    if (pointersRef.current.size > 2) return;

    const slideElement = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-lightbox-offset]") : null;
    const offset = slideElement ? Number(slideElement.dataset.lightboxOffset) : null;
    gestureRef.current = { kind: "pending", startX: event.clientX, startY: event.clientY, pointerType: event.pointerType, offset, afterPinch: false };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pointersRef.current.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    let gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === "pinch") {
      updatePinch(gesture);
      return;
    }
    if (pointersRef.current.size > 1) return;

    if (gesture.kind === "pending") {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_THRESHOLD) return;
      cancelTapTimer();
      lastTapRef.current = null;
      gesture = resolvePending(gesture, event.clientX, event.clientY);
      gestureRef.current = gesture;
    }

    if (gesture.kind === "swipe") {
      let delta = event.clientX - gesture.startX;
      if ((delta > 0 && !canNavigate(-1)) || (delta < 0 && !canNavigate(1))) delta *= 0.35;
      gestureRef.current = { ...gesture, delta };
      for (const [key, base] of gesture.bases) registryRef.current.get(key)?.x.set(base + delta);
    } else if (gesture.kind === "dismiss") {
      const raw = event.clientY - gesture.startY;
      const delta = raw < 0 ? raw * 0.2 : raw;
      const progress = Math.min(1, Math.max(0, delta) / Math.max(1, stageSize.height * 0.45));
      gestureRef.current = { ...gesture, delta };
      dismissY.set(delta);
      backdrop.set(1 - progress * 0.85);
      chrome.set((chromeVisible ? 1 : 0) * Math.max(0, 1 - progress * 3));
    } else if (gesture.kind === "pan") {
      zoom.panTo(gesture.originX + event.clientX - gesture.startX, gesture.originY + event.clientY - gesture.startY);
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    if (!pointersRef.current.delete(event.pointerId)) return;
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.kind === "pinch") {
      if (pointersRef.current.size < 2) endPinch(gesture);
      return;
    }
    if (pointersRef.current.size > 0) return;

    gestureRef.current = null;
    switch (gesture.kind) {
      case "pending":
        if (!cancelled) handleTap(event, gesture);
        break;
      case "swipe":
        endSwipe(gesture, cancelled);
        break;
      case "dismiss":
        endDismiss(gesture, cancelled);
        break;
      case "pan":
        zoom.releasePan();
        break;
      default:
        break;
    }
  }

  return (
    <div
      ref={stageRef}
      className={cn(
        "relative touch-none overflow-hidden select-none",
        zoom.isZoomed ? "cursor-grab active:cursor-grabbing" : undefined,
        closing ? "pointer-events-none" : undefined,
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointer(event, false)}
      onPointerCancel={(event) => finishPointer(event, true)}
    >
      <motion.div
        className="absolute inset-0"
        style={{ y: dismissY, scale: dismissScale, opacity: reelOpacity, maskImage, WebkitMaskImage: maskImage }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={generation}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          >
            {items.map((item) => (
              <LightboxSlideView
                key={item.virtual}
                slide={item.slide}
                offset={item.offset}
                registryKey={`${generation}:${item.virtual}`}
                size={item.size}
                initialX={reel.targets.get(item.offset) ?? 0}
                isCurrent={item.offset === 0}
                reel={reelMotion}
                backdrop={backdrop}
                flight={flight}
                zoom={zoomValues}
                register={register}
                onNaturalSize={onNaturalSize}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      <LightboxMinimap
        src={current.thumbSrc ?? current.src}
        visible={zoom.isZoomed && !closing}
        fitSize={currentSize}
        stageSize={stageSize}
        zoom={zoom}
        compact={compact}
      />
      {count > 1 && !compact ? (
        <motion.div style={{ opacity: chrome }} inert={!chromeVisible} className="pointer-events-none absolute inset-0">
          <NavButton direction={-1} label={t("previous")} disabled={!canNavigate(-1)} onClick={() => onNavigate(-1)} />
          <NavButton direction={1} label={t("next")} disabled={!canNavigate(1)} onClick={() => onNavigate(1)} />
        </motion.div>
      ) : null}
    </div>
  );
}

function NavButton({ direction, label, disabled, onClick }: { direction: -1 | 1; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "pointer-events-auto absolute top-1/2 size-11 -translate-y-1/2 cursor-pointer text-foreground/80 disabled:opacity-0",
        direction === -1 ? "left-4" : "right-4",
      )}
    >
      <HugeiconsIcon icon={direction === -1 ? ArrowLeft01Icon : ArrowRight01Icon} className="size-6" aria-hidden="true" />
    </Button>
  );
}

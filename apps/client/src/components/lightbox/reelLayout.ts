import { type MotionValue, motionValue } from "motion/react";

import type { Size } from "./types";

const PEEK_SCALE = 0.86;
const PEEK_OPACITY = 0.5;
const PEEK_GAP = 24;
const PEEK_MIN_SPACE = 96;
const SLIDE_GAP = 40;
const SLIDE_FADE = 64;
const FADE_INSET = 8;

export type ReelParams = {
  peek: number;
  visibility: number;
  nearLeft: number;
  nearRight: number;
  farLeft: number;
  farRight: number;
};

export type ReelMotion = Record<keyof ReelParams, MotionValue<number>>;

export const REEL_PARAM_KEYS: readonly (keyof ReelParams)[] = ["peek", "visibility", "nearLeft", "nearRight", "farLeft", "farRight"];

export type ReelLayout = {
  targets: Map<number, number>;
  params: ReelParams;
  fade: number;
};

export function mod(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function hasSlideAt(from: number, offset: number, count: number, loop: boolean) {
  if (offset !== 0 && count < 2) return false;
  return loop || (from + offset >= 0 && from + offset < count);
}

export function createReelMotion(): ReelMotion {
  return {
    peek: motionValue(0),
    visibility: motionValue(0),
    nearLeft: motionValue(0),
    nearRight: motionValue(0),
    farLeft: motionValue(0),
    farRight: motionValue(0),
  };
}

export function readReelMotion(reel: ReelMotion): ReelParams {
  return {
    peek: reel.peek.get(),
    visibility: reel.visibility.get(),
    nearLeft: reel.nearLeft.get(),
    nearRight: reel.nearRight.get(),
    farLeft: reel.farLeft.get(),
    farRight: reel.farRight.get(),
  };
}

export function fitSize(natural: Size | undefined, box: Size): Size {
  if (box.width <= 0 || box.height <= 0) return { width: 0, height: 0 };
  if (!natural || natural.width <= 0 || natural.height <= 0) {
    const width = Math.min(box.width, (box.height * 4) / 3);
    return { width, height: (width * 3) / 4 };
  }

  const ratio = Math.min(box.width / natural.width, box.height / natural.height, 1);
  return { width: natural.width * ratio, height: natural.height * ratio };
}

export function computeReel(widths: Map<number, number>, stageWidth: number, peekRequested: boolean, neighboursVisible: boolean): ReelLayout {
  const currentWidth = widths.get(0) ?? 0;
  const sideSpace = (stageWidth - currentWidth) / 2;
  const peek = peekRequested && sideSpace >= PEEK_MIN_SPACE;
  const targets = new Map<number, number>([[0, 0]]);

  for (const direction of [-1, 1]) {
    let distance = 0;
    let previousHalf = currentWidth / 2;
    for (let step = 1; step <= 2; step++) {
      const width = widths.get(step * direction);
      if (width === undefined) break;
      if (peek) {
        const half = (width * PEEK_SCALE) / 2;
        distance += previousHalf + PEEK_GAP + half;
        previousHalf = half;
      } else {
        distance = step * (stageWidth + SLIDE_GAP);
      }
      targets.set(step * direction, distance * direction);
    }
  }

  const fallbackNear = currentWidth / 2 + PEEK_GAP + (currentWidth * PEEK_SCALE) / 2;
  const nearLeft = Math.abs(targets.get(-1) ?? fallbackNear);
  const nearRight = targets.get(1) ?? fallbackNear;
  const fade = Math.max(0, sideSpace - FADE_INSET);

  return {
    targets,
    params: {
      peek: peek ? 1 : 0,
      visibility: neighboursVisible ? 1 : 0,
      nearLeft,
      nearRight,
      farLeft: Math.abs(targets.get(-2) ?? nearLeft * 2),
      farRight: targets.get(2) ?? nearRight * 2,
    },
    fade: peek ? fade : Math.min(fade, SLIDE_FADE),
  };
}

function peekAppearance(x: number, params: ReelParams) {
  const near = x < 0 ? params.nearLeft : params.nearRight;
  const far = x < 0 ? params.farLeft : params.farRight;
  const distance = Math.abs(x);
  const restingOpacity = PEEK_OPACITY * params.visibility;
  if (distance <= near) {
    const progress = near > 0 ? distance / near : 1;
    return { scale: 1 - (1 - PEEK_SCALE) * progress, opacity: 1 - (1 - restingOpacity) * progress };
  }

  const progress = far > near ? Math.min(1, (distance - near) / (far - near)) : 1;
  return { scale: PEEK_SCALE, opacity: restingOpacity * (1 - progress) };
}

export function reelAppearance(x: number, params: ReelParams) {
  const peek = peekAppearance(x, params);
  return { scale: 1 - (1 - peek.scale) * params.peek, opacity: 1 - (1 - peek.opacity) * params.peek };
}

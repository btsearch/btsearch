import { useRef, useState } from "react";

import { preloadLightbox } from "./lightbox";

type Triggers = Map<number, HTMLElement>;
type TriggerRef = ReturnType<typeof createTriggerRef>;

const triggerRefsByTriggers = new WeakMap<Triggers, Map<number, TriggerRef>>();

function createTriggerRef(triggers: Triggers, triggerIndex: number) {
  return (element: HTMLElement | null) => {
    if (!element) return;
    triggers.set(triggerIndex, element);
    return () => {
      if (triggers.get(triggerIndex) === element) triggers.delete(triggerIndex);
    };
  };
}

function getTriggerRef(triggers: Triggers, triggerIndex: number): TriggerRef {
  const knownRefs = triggerRefsByTriggers.get(triggers);
  const triggerRefs = knownRefs ?? new Map<number, TriggerRef>();
  if (knownRefs === undefined) triggerRefsByTriggers.set(triggers, triggerRefs);

  const knownRef = triggerRefs.get(triggerIndex);
  if (knownRef !== undefined) return knownRef;

  const triggerRef = createTriggerRef(triggers, triggerIndex);
  triggerRefs.set(triggerIndex, triggerRef);
  return triggerRef;
}

export function useLightbox() {
  const [index, setIndex] = useState<number | null>(null);
  const triggersRef = useRef(new Map<number, HTMLElement>());

  const close = () => setIndex(null);
  const getTrigger = (triggerIndex: number) => triggersRef.current.get(triggerIndex) ?? null;

  function triggerRef(triggerIndex: number) {
    return getTriggerRef(triggersRef.current, triggerIndex);
  }

  function getTriggerProps(triggerIndex: number) {
    return {
      ref: triggerRef(triggerIndex),
      onClick: () => setIndex(triggerIndex),
      onPointerEnter: preloadLightbox,
      onFocus: preloadLightbox,
      "aria-haspopup": "dialog" as const,
    };
  }

  return {
    open: setIndex,
    close,
    triggerRef,
    getTriggerProps,
    getTrigger,
    lightboxProps: { index, onClose: close, getTrigger },
  };
}

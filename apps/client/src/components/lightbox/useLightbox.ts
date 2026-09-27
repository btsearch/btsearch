import { useRef, useState } from "react";

import { preloadLightbox } from "./lightbox";

export function useLightbox() {
  const [index, setIndex] = useState<number | null>(null);
  const triggersRef = useRef(new Map<number, HTMLElement>());

  const close = () => setIndex(null);
  const getTrigger = (triggerIndex: number) => triggersRef.current.get(triggerIndex) ?? null;

  function triggerRef(triggerIndex: number) {
    return (element: HTMLElement | null) => {
      if (!element) return;
      triggersRef.current.set(triggerIndex, element);
      return () => {
        if (triggersRef.current.get(triggerIndex) === element) triggersRef.current.delete(triggerIndex);
      };
    };
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

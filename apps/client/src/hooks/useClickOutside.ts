import { type RefObject, useEffect, useEffectEvent } from "react";

type ClickOutsideEntry = {
  ref: RefObject<HTMLElement | null>;
  callback: () => void;
};

const clickOutsideListeners = new Set<ClickOutsideEntry>();

function globalMousedownHandler(e: MouseEvent) {
  for (const entry of clickOutsideListeners) {
    if (entry.ref.current && !entry.ref.current.contains(e.target as Node)) {
      entry.callback();
    }
  }
}

export function useClickOutside<T extends HTMLElement>(ref: RefObject<T | null>, callback: () => void, enabled = true) {
  const onClickOutside = useEffectEvent(callback);

  useEffect(() => {
    if (!enabled) return;

    const entry: ClickOutsideEntry = {
      ref: ref as RefObject<HTMLElement | null>,
      callback: () => onClickOutside(),
    };

    if (clickOutsideListeners.size === 0) {
      document.addEventListener("mousedown", globalMousedownHandler);
    }
    clickOutsideListeners.add(entry);

    return () => {
      clickOutsideListeners.delete(entry);
      if (clickOutsideListeners.size === 0) {
        document.removeEventListener("mousedown", globalMousedownHandler);
      }
    };
  }, [ref, enabled]);
}

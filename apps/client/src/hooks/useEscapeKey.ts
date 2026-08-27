import { useEffect, useEffectEvent } from "react";

type EscapeCallback = () => void;
const escapeListeners = new Set<EscapeCallback>();

function globalEscapeHandler(e: KeyboardEvent) {
  if (e.key === "Escape") {
    for (const cb of escapeListeners) cb();
  }
}

export function useEscapeKey(callback: () => void, enabled = true) {
  const onEscape = useEffectEvent(callback);

  useEffect(() => {
    if (!enabled) return;

    const handler: EscapeCallback = () => onEscape();

    if (escapeListeners.size === 0) {
      window.addEventListener("keydown", globalEscapeHandler);
    }
    escapeListeners.add(handler);

    return () => {
      escapeListeners.delete(handler);
      if (escapeListeners.size === 0) {
        window.removeEventListener("keydown", globalEscapeHandler);
      }
    };
  }, [enabled]);
}

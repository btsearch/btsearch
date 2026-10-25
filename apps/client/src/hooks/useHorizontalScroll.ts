import { useCallback, useEffect, useRef } from "react";

export function useHorizontalScroll<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback((element: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!element) return;

    const target = element;

    function onWheel(e: WheelEvent) {
      const canScrollX = target.scrollWidth > target.clientWidth;
      if (!canScrollX) return;

      const canScrollY = target.scrollHeight > target.clientHeight && !["hidden", "clip"].includes(getComputedStyle(target).overflowY);
      if (canScrollY) return;

      // let trackpad horizontal swipes pass through natively
      if (e.deltaX !== 0) return;

      const maxScrollLeft = target.scrollWidth - target.clientWidth;
      const atStart = target.scrollLeft <= 0;
      const atEnd = target.scrollLeft >= maxScrollLeft;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;

      e.preventDefault();
      target.scrollLeft += e.deltaY;
    }

    target.addEventListener("wheel", onWheel, { passive: false });
    cleanupRef.current = () => target.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  return ref;
}

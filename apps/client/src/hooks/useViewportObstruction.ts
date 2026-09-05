import { useEffect } from "react";

const TOP_OBSTRUCTION_VAR = "--top-viewport-obstruction";
const OBSTRUCTION_SETTLE_DELAY_MS = 400;

// Keep fixed app chrome aligned if an external surface shifts the application root
export function useViewportObstruction() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    const html = document.documentElement;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTop = -1;

    const measure = () => {
      const top = Math.max(0, Math.round(root.getBoundingClientRect().top));
      if (top !== lastTop) {
        lastTop = top;
        html.style.setProperty(TOP_OBSTRUCTION_VAR, `${top}px`);
      }
    };

    const measureAndSettle = () => {
      measure();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(measure, OBSTRUCTION_SETTLE_DELAY_MS);
    };

    let siblingObservers: MutationObserver[] = [];
    const observeRootSiblings = () => {
      for (const siblingObserver of siblingObservers) siblingObserver.disconnect();
      siblingObservers = [];
      for (const child of document.body.children) {
        if (child === root) continue;
        const siblingObserver = new MutationObserver(measureAndSettle);
        siblingObserver.observe(child, { attributes: true, attributeFilter: ["style", "class"], childList: true, subtree: true });
        siblingObservers.push(siblingObserver);
      }
    };

    measure();
    observeRootSiblings();
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === "childList")) observeRootSiblings();
      measureAndSettle();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"], childList: true });
    window.addEventListener("resize", measureAndSettle);
    window.visualViewport?.addEventListener("resize", measureAndSettle);

    return () => {
      observer.disconnect();
      for (const siblingObserver of siblingObservers) siblingObserver.disconnect();
      clearTimeout(settleTimer);
      window.removeEventListener("resize", measureAndSettle);
      window.visualViewport?.removeEventListener("resize", measureAndSettle);
      html.style.removeProperty(TOP_OBSTRUCTION_VAR);
    };
  }, []);
}

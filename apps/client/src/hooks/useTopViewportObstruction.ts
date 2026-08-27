import { useEffect } from "react";

const OBSTRUCTION_RELEASE_DELAY_MS = 1_000;
const OBSTRUCTION_SETTLE_DELAY_MS = 400;

// Google top anchor ads push the page down, clipping the bottom of the 100dvh app shell
export function useTopViewportObstruction() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingDecrease: number | undefined;
    let decreaseTimer: ReturnType<typeof setTimeout> | undefined;
    let lastOffset = -1;

    const readOffset = () => Math.max(0, Math.round(root.getBoundingClientRect().top));
    const applyOffset = (offset: number) => {
      if (offset === lastOffset) return;
      lastOffset = offset;
      document.documentElement.style.setProperty("--top-viewport-obstruction", `${offset}px`);
    };
    const clearPendingDecrease = () => {
      clearTimeout(decreaseTimer);
      decreaseTimer = undefined;
      pendingDecrease = undefined;
    };
    const processOffset = (offset: number) => {
      if (offset >= lastOffset) {
        clearPendingDecrease();
        applyOffset(offset);
        return;
      }
      if (offset === pendingDecrease && decreaseTimer !== undefined) return;

      clearPendingDecrease();
      pendingDecrease = offset;
      decreaseTimer = setTimeout(() => {
        decreaseTimer = undefined;
        pendingDecrease = undefined;
        const confirmedOffset = readOffset();
        if (confirmedOffset === offset) {
          applyOffset(confirmedOffset);
          return;
        }
        processOffset(confirmedOffset);
      }, OBSTRUCTION_RELEASE_DELAY_MS);
    };
    const measure = () => processOffset(readOffset());

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(measure, OBSTRUCTION_SETTLE_DELAY_MS);
    };

    let siblingObservers: MutationObserver[] = [];
    const observeRootSiblings = () => {
      for (const siblingObserver of siblingObservers) siblingObserver.disconnect();
      siblingObservers = [];
      for (const child of document.body.children) {
        if (child === root) continue;
        const siblingObserver = new MutationObserver(schedule);
        siblingObserver.observe(child, { attributes: true, attributeFilter: ["style", "class"], childList: true, subtree: true });
        siblingObservers.push(siblingObserver);
      }
    };

    measure();
    observeRootSiblings();
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === "childList")) observeRootSiblings();
      schedule();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"], childList: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      for (const siblingObserver of siblingObservers) siblingObserver.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      clearPendingDecrease();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, []);
}

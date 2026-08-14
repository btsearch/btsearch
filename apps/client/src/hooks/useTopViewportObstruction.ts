import { useEffect } from "react";

// Google top anchor ads push the page down, clipping the bottom of the 100dvh app shell
export function useTopViewportObstruction() {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let lastOffset = -1;

    const measure = () => {
      const offset = Math.max(0, Math.round(root.getBoundingClientRect().top));
      if (offset === lastOffset) return;
      lastOffset = offset;
      document.documentElement.style.setProperty("--top-viewport-obstruction", `${offset}px`);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
      clearTimeout(settle);
      settle = setTimeout(measure, 400);
    };

    measure();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"], childList: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, []);
}

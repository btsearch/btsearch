import { useEffect } from "react";

// Mobile browsers can leave the page panned after the on-screen keyboard closes, showing a dead band at the bottom
export function useVirtualKeyboardScrollReset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let lastHeight = viewport.height;
    const handleResize = () => {
      const grew = viewport.height > lastHeight;
      lastHeight = viewport.height;
      if (!grew) return;
      const scroller = document.scrollingElement;
      if (scroller && scroller.scrollTop !== 0) scroller.scrollTop = 0;
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    viewport.addEventListener("resize", handleResize);
    return () => viewport.removeEventListener("resize", handleResize);
  }, []);
}

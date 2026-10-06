import { useLayoutEffect, useRef, useState } from "react";

export function useColumnRoom<Root extends HTMLElement = HTMLDivElement>(narrowestWidth: number) {
  const rootRef = useRef<Root>(null);
  const [hasColumnRoom, setHasColumnRoom] = useState(true);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) return;

    const measureRoot = () => setHasColumnRoom(root.clientWidth >= narrowestWidth);
    const observer = new ResizeObserver(measureRoot);
    measureRoot();
    observer.observe(root);
    return () => observer.disconnect();
  }, [narrowestWidth]);

  return { rootRef, hasColumnRoom };
}

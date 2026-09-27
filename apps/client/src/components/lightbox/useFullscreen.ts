import { useEffect, useRef, useState } from "react";

export function useFullscreen() {
  const [active, setActive] = useState(false);
  const enteredRef = useRef(false);
  const supported = document.fullscreenEnabled;

  useEffect(() => {
    const handleChange = () => setActive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      if (enteredRef.current && document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  function toggle() {
    if (!supported) return;
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    enteredRef.current = true;
    void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  return { supported, active, toggle };
}

export type FullscreenController = ReturnType<typeof useFullscreen>;

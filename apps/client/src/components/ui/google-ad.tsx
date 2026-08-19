import { useEffect, useRef } from "react";

import { authClient } from "@/lib/authClient";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;

type AdFormat = "auto" | "horizontal" | "rectangle" | "vertical";

interface GoogleAdProps {
  adSlot: string;
  adFormat?: AdFormat;
  className?: string;
}

const PRIVILEGED_ROLES = new Set(["admin", "editor"]);

const MIN_HEIGHTS: Record<AdFormat, string> = {
  auto: "100px",
  horizontal: "90px",
  rectangle: "200px",
  vertical: "600px",
};

const AD_PRELOAD_MARGIN = "200px 0px";

function pushAd() {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // adblocker might have blocked it
  }
}

export function GoogleAd({ adSlot, adFormat = "auto", className }: GoogleAdProps) {
  const { data: session, isPending } = authClient.useSession();
  const shouldRenderAd = !!AD_CLIENT && !PRIVILEGED_ROLES.has(session?.user?.role as string);
  const containerRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!shouldRenderAd) {
      pushed.current = false;
      return;
    }
    if (isPending) return;
    if (pushed.current) return;

    const container = containerRef.current;
    if (!container) return;

    const initializeAd = () => {
      if (pushed.current) return;
      pushed.current = true;
      pushAd();
    };

    if (!("IntersectionObserver" in window)) {
      initializeAd();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        initializeAd();
      },
      { rootMargin: AD_PRELOAD_MARGIN },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [isPending, shouldRenderAd]);

  if (!shouldRenderAd) return null;

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: MIN_HEIGHTS[adFormat] }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive={adFormat === "auto" ? "true" : "false"}
      />
    </div>
  );
}

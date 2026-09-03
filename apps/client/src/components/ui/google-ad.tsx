import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

import { authClient } from "@/lib/authClient";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;

type AdFormat = "auto" | "horizontal" | "rectangle" | "vertical";
type AdSize = "320x50";

interface GoogleAdProps {
  adSlot: string;
  adFormat?: AdFormat;
  adSize?: AdSize;
  children?: ReactNode;
  className?: string;
}

const PRIVILEGED_ROLES = new Set(["admin", "editor"]);

const AD_FORMAT_STYLES: Record<AdFormat, CSSProperties> = {
  auto: { display: "block", minHeight: 100 },
  horizontal: { display: "block", minHeight: 90 },
  rectangle: { display: "block", minHeight: 200 },
  vertical: { display: "block", minHeight: 600 },
};

const AD_SIZE_STYLES: Record<AdSize, CSSProperties> = {
  "320x50": { display: "inline-block", width: 320, height: 50 },
};

const AD_PRELOAD_MARGIN = "200px 0px";

function pushAd() {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // adblocker might have blocked it
  }
}

export function GoogleAd({ adSlot, adFormat = "auto", adSize, children, className }: GoogleAdProps) {
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

  const style = adSize === undefined ? AD_FORMAT_STYLES[adFormat] : AD_SIZE_STYLES[adSize];
  const ad = (
    <ins
      className="adsbygoogle"
      style={style}
      data-ad-client={AD_CLIENT}
      data-ad-slot={adSlot}
      data-ad-format={adSize === undefined ? adFormat : undefined}
      data-full-width-responsive={adSize === undefined && adFormat === "auto" ? "true" : "false"}
    />
  );

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      {adSize === undefined ? (
        ad
      ) : (
        <div className="shrink-0 overflow-hidden" style={style}>
          {ad}
        </div>
      )}
      {children}
    </div>
  );
}

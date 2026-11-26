import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { useAdsenseStatus } from "../hooks/useAdsenseStatus";
import { useHouseAdsDismissed } from "../hooks/useHouseAdsDismissed";
import { useShowsAds } from "../hooks/useShowsAds";
import type { HouseAdSize } from "../houseAds";
import { HouseAd } from "./houseAd";
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
  houseAdSize?: HouseAdSize;
  children?: ReactNode;
  className?: string;
  slotClassName?: string;
}

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
const AD_FILL_TIMEOUT_MS = 3000;
const COLLAPSED_AD_STYLE: CSSProperties = { position: "absolute", width: "100%", height: 0, overflow: "hidden" };

const unfilledSlots = new Set<string>();

function pushAd() {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // adblocker might have blocked it
  }
}

export function GoogleAd(props: GoogleAdProps) {
  const { showsAds, isPending } = useShowsAds();
  if (!AD_CLIENT || !showsAds) return null;
  return <AdSlot {...props} isPending={isPending} />;
}

function AdSlot({
  adSlot,
  adFormat = "auto",
  adSize,
  houseAdSize,
  children,
  className,
  slotClassName,
  isPending,
}: GoogleAdProps & { isPending: boolean }) {
  const adsenseStatus = useAdsenseStatus();
  const houseAdsDismissed = useHouseAdsDismissed();
  const containerRef = useRef<HTMLDivElement>(null);
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [requested, setRequested] = useState(false);
  const [adMissing, setAdMissing] = useState(() => unfilledSlots.has(adSlot));

  useEffect(() => {
    const ad = adRef.current;
    if (!requested || adsenseStatus !== "ready" || ad === null) return;

    const checkFill = () => {
      const missing = ad.dataset.adStatus !== "filled";
      if (missing) unfilledSlots.add(adSlot);
      else unfilledSlots.delete(adSlot);
      setAdMissing(missing);
    };
    const observer = new MutationObserver(checkFill);
    observer.observe(ad, { attributes: true, attributeFilter: ["data-ad-status"] });
    if (ad.dataset.adStatus !== undefined) checkFill();
    const timer = setTimeout(checkFill, AD_FILL_TIMEOUT_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [requested, adsenseStatus, adSlot]);

  useEffect(() => {
    if (isPending) return;
    if (pushed.current) return;

    const container = containerRef.current;
    if (!container) return;

    const initializeAd = () => {
      if (pushed.current) return;
      pushed.current = true;
      pushAd();
      setRequested(true);
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
  }, [isPending]);

  const adUnavailable = adsenseStatus === "blocked" || adMissing;
  const showHouseAd = adUnavailable && houseAdSize !== undefined && !houseAdsDismissed;
  const collapsed = adUnavailable && !showHouseAd;
  const style = adSize === undefined ? AD_FORMAT_STYLES[adFormat] : AD_SIZE_STYLES[adSize];
  const ad = (
    <ins
      ref={adRef}
      className="adsbygoogle"
      style={style}
      data-ad-client={AD_CLIENT}
      data-ad-slot={adSlot}
      data-ad-format={adSize === undefined ? adFormat : undefined}
      data-full-width-responsive={adSize === undefined && adFormat === "auto" ? "true" : "false"}
    />
  );

  return (
    <div ref={containerRef} className={collapsed ? "relative" : cn("relative w-full", className)}>
      {showHouseAd ? <HouseAd size={houseAdSize} /> : null}
      {adSize === undefined ? (
        <div className={slotClassName} style={adUnavailable ? COLLAPSED_AD_STYLE : undefined}>
          {ad}
        </div>
      ) : (
        <div className="shrink-0 overflow-hidden" style={adUnavailable ? { ...style, ...COLLAPSED_AD_STYLE } : style}>
          {ad}
        </div>
      )}
      {collapsed ? null : children}
    </div>
  );
}

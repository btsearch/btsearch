import { useLocation } from "@tanstack/react-router";

import { DeferredHouseAd } from "./deferredHouseAd";
import { useIsMobile } from "@/hooks/useMobile";
import { useIsWideScreen } from "@/hooks/useWideScreen";
import { cn } from "@/lib/utils";

type CornerPlacement = "viewport" | "content";

const MAP_PATHNAME = "/";

const CARD_CLASS_NAME =
  "pointer-events-auto shadow-lg transition-[opacity,visibility] duration-200 [body:has([data-covers-ad-corner])_&]:invisible [body:has([data-covers-ad-corner])_&]:opacity-0";

export function CornerHouseAd({ placement }: { placement: CornerPlacement }) {
  const isMapPage = useLocation({ select: (location) => location.pathname === MAP_PATHNAME });
  const isMobile = useIsMobile();
  const isWideScreen = useIsWideScreen();
  const isViewport = placement === "viewport";

  return (
    <DeferredHouseAd
      enabled={isMapPage && (isViewport ? isWideScreen : !isMobile)}
      className={cn("pointer-events-none bottom-12 left-4 z-30", isViewport ? "fixed" : "absolute")}
      cardClassName={CARD_CLASS_NAME}
    />
  );
}

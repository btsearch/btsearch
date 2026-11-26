import { AnimatePresence, LazyMotion, m, useReducedMotion } from "motion/react";
import { useSyncExternalStore } from "react";

import { dismissHouseAds, useHouseAdsDismissed } from "../hooks/useHouseAdsDismissed";
import { useShowsAds } from "../hooks/useShowsAds";
import { HouseAd } from "./houseAd";
import { loadMotionFeatures } from "@/lib/loadMotionFeatures";
import { cn } from "@/lib/utils";

type DeferredHouseAdProps = {
  enabled: boolean;
  className?: string;
  cardClassName?: string;
};

const INTERACTION_EVENTS = ["pointerdown", "keydown", "wheel"] as const;
const FADED = { opacity: 0 } as const;
const VISIBLE = { opacity: 1 } as const;
const FADE_TRANSITION = { duration: 0.3, ease: "easeOut" } as const;
const INSTANT_TRANSITION = { duration: 0 } as const;

const interactionListeners = new Set<() => void>();
let interacted = false;

function handleFirstInteraction() {
  interacted = true;
  for (const type of INTERACTION_EVENTS) window.removeEventListener(type, handleFirstInteraction, { capture: true });
  for (const listener of interactionListeners) listener();
  interactionListeners.clear();
}

function subscribeInteraction(listener: () => void) {
  if (interacted) return () => {};

  if (interactionListeners.size === 0)
    for (const type of INTERACTION_EVENTS) window.addEventListener(type, handleFirstInteraction, { capture: true, passive: true });
  interactionListeners.add(listener);
  return () => {
    interactionListeners.delete(listener);
    if (interactionListeners.size === 0 && !interacted)
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, handleFirstInteraction, { capture: true });
  };
}

function getInteracted() {
  return interacted;
}

function getServerInteracted() {
  return false;
}

export function DeferredHouseAd({ enabled, className, cardClassName }: DeferredHouseAdProps) {
  const hasInteracted = useSyncExternalStore(subscribeInteraction, getInteracted, getServerInteracted);
  const { showsAds, isPending } = useShowsAds();
  const dismissed = useHouseAdsDismissed();
  const transition = useReducedMotion() === true ? INSTANT_TRANSITION : FADE_TRANSITION;
  if (!hasInteracted || !showsAds) return null;

  const shown = enabled && !isPending && !dismissed;
  return (
    <LazyMotion features={loadMotionFeatures}>
      <AnimatePresence>
        {shown ? (
          <m.div key="house-ad" initial={FADED} animate={VISIBLE} exit={FADED} transition={transition} className={className}>
            <HouseAd size="224x200" onClose={dismissHouseAds} className={cn("overflow-hidden rounded-lg border", cardClassName)} />
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}

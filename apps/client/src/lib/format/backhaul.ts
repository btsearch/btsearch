import { CableIcon, Router01Icon, Satellite01Icon, Satellite02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { BACKHAUL_MEDIUMS, type BackhaulMedium } from "@openbts/shared/contract/constants";

export const BACKHAUL_APPEARANCE: Record<BackhaulMedium, { icon: IconSvgElement; iconClassName: string }> = {
  fiber: { icon: CableIcon, iconClassName: "text-sky-600 dark:text-sky-400" },
  microwave: { icon: Satellite01Icon, iconClassName: "text-amber-600 dark:text-amber-400" },
  satellite: { icon: Satellite02Icon, iconClassName: "text-violet-600 dark:text-violet-400" },
  xdsl: { icon: Router01Icon, iconClassName: "text-emerald-600 dark:text-emerald-400" },
};

const BACKHAUL_MEDIUM_LABEL_KEYS = {
  fiber: "backhaulFiber",
  microwave: "backhaulMicrowave",
  satellite: "backhaulSatellite",
  xdsl: "backhaulXdsl",
} as const satisfies Record<BackhaulMedium, string>;

export function isBackhaulMedium(value: unknown): value is BackhaulMedium {
  return BACKHAUL_MEDIUMS.includes(value as BackhaulMedium);
}

export function formatSpeedMbps(mbps: number): string {
  if (mbps >= 1000) {
    const gbps = mbps / 1000;
    const formatted = Number.isInteger(gbps) ? gbps.toString() : gbps.toFixed(2).replace(/\.?0+$/, "");
    return `${formatted} Gbps`;
  }
  return `${mbps} Mbps`;
}

export function backhaulMediumLabelKey(type: BackhaulMedium): (typeof BACKHAUL_MEDIUM_LABEL_KEYS)[BackhaulMedium] {
  return BACKHAUL_MEDIUM_LABEL_KEYS[type];
}

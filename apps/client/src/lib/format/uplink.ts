import { CableIcon, Satellite01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import type { UplinkType } from "@/types/station";

export const UPLINK_TYPES: readonly UplinkType[] = ["fiber", "microwave"];

export const UPLINK_APPEARANCE: Record<UplinkType, { icon: IconSvgElement; iconClassName: string }> = {
  fiber: { icon: CableIcon, iconClassName: "text-sky-600 dark:text-sky-400" },
  microwave: { icon: Satellite01Icon, iconClassName: "text-amber-600 dark:text-amber-400" },
};

export function isUplinkType(value: unknown): value is UplinkType {
  return UPLINK_TYPES.includes(value as UplinkType);
}

export function formatSpeedMbps(mbps: number): string {
  if (mbps >= 1000) {
    const gbps = mbps / 1000;
    const formatted = Number.isInteger(gbps) ? gbps.toString() : gbps.toFixed(2).replace(/\.?0+$/, "");
    return `${formatted} Gbps`;
  }
  return `${mbps} Mbps`;
}

export function uplinkTypeKey(type: UplinkType): "uplinkFiber" | "uplinkMicrowave" {
  return type === "fiber" ? "uplinkFiber" : "uplinkMicrowave";
}

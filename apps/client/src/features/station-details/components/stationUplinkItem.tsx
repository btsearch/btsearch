import { CableIcon, Satellite01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { StationInfoItem } from "./stationInfoItem";
import { formatSpeedMbps, uplinkTypeKey } from "@/lib/format/uplink";
import { cn } from "@/lib/utils";
import type { StationUplink, UplinkType } from "@/types/station";

type StationUplinkItemProps = {
  uplink: StationUplink;
};

const uplinkAppearance: Record<UplinkType, { icon: IconSvgElement; iconClassName: string }> = {
  fiber: { icon: CableIcon, iconClassName: "text-sky-600 dark:text-sky-400" },
  microwave: { icon: Satellite01Icon, iconClassName: "text-amber-600 dark:text-amber-400" },
};

export function StationUplinkItem({ uplink }: StationUplinkItemProps) {
  const { t } = useTranslation("common");
  const { icon, iconClassName } = uplinkAppearance[uplink.type];
  const speed = typeof uplink.speed === "number" ? formatSpeedMbps(uplink.speed) : null;
  const label = uplink.model ? `${t("labels.uplink")} · ${uplink.model}` : t("labels.uplink");

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={icon} className={cn("size-4", iconClassName)} />} label={label}>
      <span>{t(`labels.${uplinkTypeKey(uplink.type)}`)}</span>
      {speed ? <span className="font-normal text-muted-foreground">({speed})</span> : null}
    </StationInfoItem>
  );
}

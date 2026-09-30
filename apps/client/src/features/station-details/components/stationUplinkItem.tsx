import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { StationInfoItem } from "./stationInfoItem";
import { UPLINK_APPEARANCE, formatSpeedMbps, uplinkTypeKey } from "@/lib/format/uplink";
import { cn } from "@/lib/utils";
import type { StationUplink } from "@/types/station";

type StationUplinkItemProps = {
  uplink: StationUplink;
};

export function StationUplinkItem({ uplink }: StationUplinkItemProps) {
  const { t } = useTranslation("common");
  const { icon, iconClassName } = UPLINK_APPEARANCE[uplink.type];
  const speed = typeof uplink.speed === "number" ? formatSpeedMbps(uplink.speed) : null;
  const label = uplink.model ? `Uplink · ${uplink.model}` : "Uplink";

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={icon} className={cn("size-4", iconClassName)} />} label={label}>
      <span>{t(`labels.${uplinkTypeKey(uplink.type)}`)}</span>
      {speed ? <span className="font-normal text-muted-foreground">({speed})</span> : null}
    </StationInfoItem>
  );
}

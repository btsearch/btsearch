import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { StationInfoItem } from "../../../components/stationInfoItem";
import type { Backhaul } from "../../types";
import { BACKHAUL_APPEARANCE, backhaulMediumLabelKey, formatSpeedMbps } from "@/lib/format/backhaul";
import { cn } from "@/lib/utils";

type BackhaulItemProps = {
  backhaul: Backhaul;
};

export function BackhaulItem({ backhaul }: BackhaulItemProps) {
  const { t } = useTranslation("common");
  const { icon, iconClassName } = BACKHAUL_APPEARANCE[backhaul.medium];
  const speed = backhaul.speedMbps === null ? null : formatSpeedMbps(backhaul.speedMbps);
  const label = backhaul.model ? `${t("labels.backhaul")} · ${backhaul.model}` : t("labels.backhaul");

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={icon} aria-hidden="true" className={cn("size-4", iconClassName)} />} label={label}>
      <span>{t(`labels.${backhaulMediumLabelKey(backhaul.medium)}`)}</span>
      {speed !== null ? <span className="font-normal text-muted-foreground">({speed})</span> : null}
    </StationInfoItem>
  );
}

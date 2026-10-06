import { Link02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { Brand, LocationStationRecord } from "../../types";
import { getBrandColor } from "../../utils/brands";
import { toV1StationStatus } from "../../utils/stations";
import { BrandMark } from "@/components/cellular/brandMark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { getOperatorTintGradient } from "@/lib/cellular/operators";
import { hasModifierKey } from "@/lib/dom/keyboard";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
  "inline-flex h-6 shrink-0 items-center gap-[5px] rounded-md px-[7px] whitespace-nowrap outline-none ring-1 ring-inset focus-visible:ring-2 focus-visible:ring-ring";

type StationSiblingChipProps = {
  station: LocationStationRecord;
  brand: Brand | null;
  isCurrent: boolean;
  onSelect: (stationId: number) => void;
  onPrefetch: (stationId: number) => void;
};

export function StationSiblingChip({ station, brand, isCurrent, onSelect, onPrefetch }: StationSiblingChipProps) {
  const { t } = useTranslation(["stationDetails", "main"]);
  const operatorName = station.operator?.name ?? t("main:unknownOperator");

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hasModifierKey(event)) return;
    event.preventDefault();
    onSelect(station.id);
  };

  const chip = isCurrent ? (
    <span aria-current="true" tabIndex={-1} className={cn(CHIP_CLASS, "bg-muted ring-foreground/30")} />
  ) : (
    <a
      href={`/stations/${station.id}`}
      onClick={handleClick}
      onPointerEnter={() => onPrefetch(station.id)}
      onFocus={() => onPrefetch(station.id)}
      className={cn(CHIP_CLASS, "cursor-pointer ring-border/60 transition-colors hover:bg-muted/50")}
      style={{ backgroundImage: getOperatorTintGradient(getBrandColor(brand)) }}
    />
  );

  return (
    <Tooltip>
      <TooltipTrigger render={chip}>
        <BrandMark brand={brand} size={14} />
        <span className="sr-only">{operatorName}</span>
        <span className={cn("font-mono text-[11px] leading-4", isCurrent ? "text-foreground" : "text-foreground/70")}>{station.siteId}</span>
        {station.hostStationId !== null ? (
          <>
            <HugeiconsIcon icon={Link02Icon} className="size-3 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden="true" />
            <span className="sr-only">{t("dialog.virtualStation")}</span>
          </>
        ) : null}
        {station.status !== "active" ? <StationStatusBadge status={toV1StationStatus(station.status)} className="pointer-events-none" /> : null}
      </TooltipTrigger>
      <TooltipContent>{`${operatorName} ${station.siteId}`}</TooltipContent>
    </Tooltip>
  );
}

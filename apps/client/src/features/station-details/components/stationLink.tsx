import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties, MouseEvent } from "react";

import { StationTitle } from "./stationTitle";
import type { BrandLook } from "@/components/cellular/brandMark";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { hasModifierKey } from "@/lib/dom/keyboard";
import { cn } from "@/lib/utils";
import type { PhysicalStation } from "@/types/station";

type StationLinkProps = {
  station: PhysicalStation;
  operatorBrand?: BrandLook | null;
  onOpen: (id: number) => void;
  className?: string;
  stationIdClassName?: string;
  style?: CSSProperties;
};

export function StationLink({ station, operatorBrand = null, onOpen, className, stationIdClassName, style }: StationLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hasModifierKey(event)) return;
    event.preventDefault();
    onOpen(station.id);
  };

  return (
    <a
      href={`/stations/${station.id}`}
      onClick={handleClick}
      className={cn("group min-w-0 items-center gap-1.5 focus-visible:outline-none", className)}
      style={style}
    >
      <StationTitle
        stationId={station.station_id}
        operator={{ name: station.operator.name, brand: operatorBrand }}
        stationIdClassName={stationIdClassName}
      />
      {station.status !== "published" ? <StationStatusBadge status={station.status} /> : null}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
        aria-hidden="true"
      />
    </a>
  );
}

import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { Brand, LocationStationRecord } from "../../types";
import { toV1StationStatus } from "../../utils/stations";
import { BrandMark } from "@/components/cellular/brandMark";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { getOperatorTintGradient } from "@/lib/cellular/operators";
import { hasModifierKey } from "@/lib/dom/keyboard";

type HostStationLinkProps = {
  station: LocationStationRecord;
  brand: Brand | null;
  onOpen: (stationId: number) => void;
};

export function HostStationLink({ station, brand, onOpen }: HostStationLinkProps) {
  const { t } = useTranslation("main");

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hasModifierKey(event)) return;
    event.preventDefault();
    onOpen(station.id);
  };

  return (
    <a
      href={`/stations/${station.id}`}
      onClick={handleClick}
      className="group flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ backgroundImage: brand === null ? undefined : getOperatorTintGradient(brand.color) }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <BrandMark brand={brand} size={16} />
        <span className="min-w-0 truncate text-xs font-medium text-foreground">{station.operator?.name ?? t("unknownOperator")}</span>
      </span>
      <span className="shrink-0 font-mono text-xs font-medium text-foreground tabular-nums">{station.siteId}</span>
      {station.status !== "active" ? <StationStatusBadge status={toV1StationStatus(station.status)} /> : null}
      <HugeiconsIcon
        icon={ArrowUpRight01Icon}
        className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
        aria-hidden="true"
      />
    </a>
  );
}

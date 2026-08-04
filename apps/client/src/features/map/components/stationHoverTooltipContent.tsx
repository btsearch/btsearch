import { memo } from "react";

export type StationHoverEntry = {
  name: string;
  color: string;
  stationId: string;
};

type StationHoverTooltipContentProps = {
  city?: string;
  address?: string;
  region?: string;
  stations: StationHoverEntry[];
};

const MAX_VISIBLE = 5;

export const StationHoverTooltipContent = memo(function StationHoverTooltipContent({
  city,
  address,
  region,
  stations,
}: StationHoverTooltipContentProps) {
  const shown = stations.slice(0, MAX_VISIBLE);
  const remaining = stations.length - MAX_VISIBLE;

  return (
    <div className="w-72 text-sm">
      <div className="px-3 py-2 border-b border-border/50">
        <h3 className="font-medium text-sm leading-tight">
          {city || "Unknown"}
          {region && <span className="font-normal text-[10px] text-muted-foreground ml-1">· {region}</span>}
        </h3>
        {address && <p className="text-[11px] text-muted-foreground">{address}</p>}
      </div>

      <div>
        {shown.map((station) => (
          <div key={station.stationId} className="px-3 py-1.5 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-[2px] shrink-0" style={{ backgroundColor: station.color }} />
              <span className="font-medium text-xs">{station.name}</span>
              <span className="text-[11px] text-foreground/70">{station.stationId}</span>
            </div>
          </div>
        ))}
        {remaining > 0 && <div className="px-3 py-1.5 text-[10px] text-muted-foreground">+{remaining} more</div>}
      </div>
    </div>
  );
});

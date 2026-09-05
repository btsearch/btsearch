import type { ReactNode } from "react";

import type { GpsFormat } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/gpsUtils";
import { cn } from "@/lib/utils";

type MapCoordinatesProps = {
  position: { lat: number; lng: number } | null;
  gpsFormat: GpsFormat;
  className?: string;
  children?: ReactNode;
};

export function MapCoordinates({ position, gpsFormat, className, children }: MapCoordinatesProps) {
  return (
    <div className={cn("flex items-stretch shadow-xl rounded-lg overflow-hidden border bg-background/95 backdrop-blur-md", className)}>
      <div className="px-2.5 py-1.5 flex items-center gap-2 border-r border-border/50">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-none">GPS</span>
          <span className="text-xs font-mono font-bold tabular-nums text-foreground leading-none">
            {position ? formatCoordinates(position.lat, position.lng, gpsFormat) : "0.00000, 0.00000"}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

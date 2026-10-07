import { useTranslation } from "react-i18next";

import { MapMarker, MarkerContent } from "@/components/ui/map";
import { getOperatorLook, useMapLookups } from "@/features/map/data/mapLookups";
import { getPermitBands } from "@/features/map/utils";
import { cn } from "@/lib/utils";
import type { UkeLocationWithPermits, UkeStation } from "@/types/station";

type RegisterStationOverlayProps = {
  location: UkeLocationWithPermits;
  stations: readonly UkeStation[];
  onStationPick: (station: UkeStation) => void;
};

const TAG_CLASS = "px-1 py-px rounded-md bg-muted text-[8px] text-muted-foreground border border-border/50";

export function RegisterStationOverlay({ location, stations, onStationPick }: RegisterStationOverlayProps) {
  const { t } = useTranslation("submissions");
  const { lookups } = useMapLookups();

  return (
    <MapMarker longitude={location.longitude} latitude={location.latitude} anchor="bottom">
      <MarkerContent className="cursor-default">
        <div
          role="dialog"
          aria-label={t("locationPicker.selectStation")}
          className="w-72 mb-2 bg-popover border rounded-lg shadow-lg overflow-hidden text-sm"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border/50">
            <h3 className="font-medium text-sm leading-tight pr-4">{location.city}</h3>
            {location.address ? <p className="text-[11px] text-muted-foreground">{location.address}</p> : null}
          </div>
          <div className="max-h-54 overflow-y-auto custom-scrollbar">
            {stations.map((station) => {
              const { color } = getOperatorLook(lookups, station.operator?.id);
              const permitCount = station.permits.length;

              return (
                <button
                  key={station.station_id}
                  type="button"
                  onClick={() => onStationPick({ ...station, location: station.location ?? location })}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 cursor-pointer border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-medium text-xs" style={{ color }}>
                      {station.operator?.name || t("main:unknownOperator")}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">{station.station_id}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 pl-3.5">
                    {getPermitBands(station.permits).map((band) => (
                      <span key={band} className={cn(TAG_CLASS, "font-semibold uppercase tracking-wider")}>
                        {band}
                      </span>
                    ))}
                    <span className={cn(TAG_CLASS, "font-mono font-medium")}>
                      {permitCount} {permitCount === 1 ? "permit" : "permits"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="px-3 py-1 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground">{t("locationPicker.selectStation")}</span>
          </div>
        </div>
      </MarkerContent>
    </MapMarker>
  );
}

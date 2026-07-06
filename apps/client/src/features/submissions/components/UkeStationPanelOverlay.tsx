import { useTranslation } from "react-i18next";

import { MapMarker, MarkerContent } from "@/components/ui/map";
import { getPermitBands } from "@/features/map/utils";
import { getOperatorColor } from "@/lib/operatorUtils";
import type { UkeStation } from "@/types/station";

import type { UkeStationPanel } from "./useLocationPickerState";

type UkeStationPanelOverlayProps = {
  ukeStationPanel: UkeStationPanel;
  onStationSelect: (station: UkeStation) => void;
};

export function UkeStationPanelOverlay({ ukeStationPanel, onStationSelect }: UkeStationPanelOverlayProps) {
  const { t } = useTranslation("submissions");

  return (
    <MapMarker longitude={ukeStationPanel.location.longitude} latitude={ukeStationPanel.location.latitude} anchor="bottom">
      <MarkerContent className="cursor-default">
        <div
          role="dialog"
          className="w-72 mb-2 bg-popover border rounded-lg shadow-lg overflow-hidden text-sm"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border/50">
            <h3 className="font-medium text-sm leading-tight pr-4">{ukeStationPanel.location.city}</h3>
            {ukeStationPanel.location.address && <p className="text-[11px] text-muted-foreground">{ukeStationPanel.location.address}</p>}
          </div>
          <div className="max-h-54 overflow-y-auto custom-scrollbar">
            {ukeStationPanel.stations.map((station) => {
              const mnc = station.operator?.mnc;
              const operatorName = station.operator?.name || "Unknown";
              const color = mnc ? getOperatorColor(mnc) : "#3b82f6";
              const bands = getPermitBands(station.permits);

              return (
                <button
                  key={station.station_id}
                  type="button"
                  onClick={() => onStationSelect({ ...station, location: station.location ?? ukeStationPanel.location })}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 cursor-pointer border-b border-border/30 last:border-0"
                >
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-medium text-xs" style={{ color }}>
                      {operatorName}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">{station.station_id}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 pl-3.5">
                    {bands.map((band) => (
                      <span
                        key={band}
                        className="px-1 py-px rounded-md bg-muted text-[8px] font-semibold uppercase tracking-wider text-muted-foreground border border-border/50"
                      >
                        {band}
                      </span>
                    ))}
                    <span className="px-1 py-px rounded-md bg-muted text-[8px] font-mono font-medium text-muted-foreground border border-border/50">
                      {station.permits.length} {station.permits.length === 1 ? "permit" : "permits"}
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

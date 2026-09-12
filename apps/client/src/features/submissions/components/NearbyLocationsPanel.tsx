import { Add01Icon, Cancel01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { NearbyPanel } from "./useLocationPickerState";
import { MapMarker, MarkerContent } from "@/components/ui/map";
import type { LocationWithStations } from "@/types/station";

type NearbyLocationsPanelProps = {
  nearbyPanel: NearbyPanel;
  onLocationSelect: (loc: LocationWithStations) => void;
  onClose: () => void;
  onCreateNew: () => void;
};

export function NearbyLocationsPanel({ nearbyPanel, onLocationSelect, onClose, onCreateNew }: NearbyLocationsPanelProps) {
  const { t } = useTranslation("submissions");

  return (
    <MapMarker longitude={nearbyPanel.coords.lng} latitude={nearbyPanel.coords.lat} anchor="bottom">
      <MarkerContent className="cursor-default">
        <div
          role="dialog"
          className="w-52 mb-2 bg-popover border rounded-lg shadow-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="px-2.5 py-1.5 border-b bg-muted/50 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">{t("locationPicker.nearbyLocations")}</span>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
            </button>
          </div>
          <div className="max-h-28 overflow-y-auto">
            {nearbyPanel.locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => onLocationSelect(loc)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-accent transition-colors text-left border-b last:border-b-0"
              >
                <HugeiconsIcon icon={Location01Icon} className="size-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{loc.address || loc.city || `#${loc.id}`}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {t("stations:stationsCount", { count: loc.stations?.length ?? 0 })} · {Math.round(loc.distance)} m
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors border-t"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3" />
            {t("locationPicker.createNewLocation")}
          </button>
        </div>
      </MarkerContent>
    </MapMarker>
  );
}

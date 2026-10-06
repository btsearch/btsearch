import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { PickerLocation } from "../../data/places";
import type { NearbyLocation } from "./pickerMapPoints";
import { CloseButton } from "@/components/ui/close-button";
import { MapMarker, MarkerContent } from "@/components/ui/map";
import type { PlacePoint } from "@/lib/geo/geocoding";
import { cn } from "@/lib/utils";

type NearbyLocationsPanelProps = {
  point: PlacePoint;
  locations: readonly NearbyLocation[];
  onLocationPick: (location: PickerLocation) => void;
  onNewLocation: () => void;
  onClose: () => void;
};

const ROW_CLASS = "w-full flex cursor-pointer items-center px-2.5 py-1.5 hover:bg-accent transition-colors";

export function NearbyLocationsPanel({ point, locations, onLocationPick, onNewLocation, onClose }: NearbyLocationsPanelProps) {
  const { t } = useTranslation("submissions");
  const title = t("locationPicker.nearbyLocations");

  return (
    <MapMarker longitude={point.longitude} latitude={point.latitude} anchor="bottom">
      <MarkerContent className="cursor-default">
        <div
          role="dialog"
          aria-label={title}
          className="w-52 mb-2 bg-popover border rounded-lg shadow-lg overflow-hidden"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="py-1 pr-1 pl-2.5 border-b bg-muted/50 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
            <CloseButton size="xs" onClick={onClose} />
          </div>
          <div className="max-h-28 overflow-y-auto">
            {locations.map(({ location, distance }) => (
              <button
                key={location.id}
                type="button"
                onClick={() => onLocationPick(location)}
                className={cn(ROW_CLASS, "gap-1.5 text-left border-b last:border-b-0")}
              >
                <HugeiconsIcon icon={Location01Icon} className="size-3 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{location.address || location.city || `#${location.id}`}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {t("common:labels.stations", { count: location.stations.length })} · {Math.round(distance)} m
                  </div>
                </div>
              </button>
            ))}
          </div>
          <button type="button" onClick={onNewLocation} className={cn(ROW_CLASS, "justify-center gap-1 text-xs text-muted-foreground border-t")}>
            <HugeiconsIcon icon={Add01Icon} className="size-3" />
            {t("locationPicker.createNewLocation")}
          </button>
        </div>
      </MarkerContent>
    </MapMarker>
  );
}

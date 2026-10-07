import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { Brand, LocationRecord } from "../../types";
import { getOperatorBrand } from "../../utils/brands";
import { sortLocationStations } from "../../utils/stations";
import { StationSiblingChip } from "./stationSiblingChip";

type StationSiblingStripProps = {
  stationId: number;
  location?: LocationRecord;
  brands?: Brand[];
  onSelect: (stationId: number) => void;
  onPrefetch: (stationId: number) => void;
  onContentLayoutChange?: () => void;
};

export function StationSiblingStrip({ stationId, location, brands, onSelect, onPrefetch, onContentLayoutChange }: StationSiblingStripProps) {
  const { t } = useTranslation("stationDetails");
  const stripRef = useRef<HTMLElement>(null);
  const restoresFocusRef = useRef(false);
  const locationId = location?.id;
  const stationCount = location?.stations.length ?? 0;

  useLayoutEffect(() => {
    stripRef.current?.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    onContentLayoutChange?.();
  }, [locationId, stationCount, stationId, onContentLayoutChange]);

  useEffect(() => {
    if (!restoresFocusRef.current) return;
    restoresFocusRef.current = false;
    stripRef.current?.querySelector<HTMLElement>("[aria-current]")?.focus();
  }, [stationId]);

  if (location === undefined || location.stations.length < 2) return null;
  if (!location.stations.some((station) => station.id === stationId)) return null;

  const stations = sortLocationStations(location.stations);
  const selectStation = (siblingId: number) => {
    restoresFocusRef.current = true;
    onSelect(siblingId);
  };

  return (
    <nav
      ref={stripRef}
      aria-label={t("page.stationsAtLocation")}
      className="scrollbar-hide flex shrink-0 items-center gap-1 overflow-x-auto border-b px-4 py-1.5 sm:px-6 md:flex-wrap md:overflow-x-visible"
    >
      <span aria-hidden="true" className="mr-1 shrink-0 whitespace-nowrap text-[11px] font-medium leading-4 text-muted-foreground">
        {t("dialog.atThisLocation")}
      </span>
      {stations.map((station) => (
        <StationSiblingChip
          key={station.id}
          station={station}
          brand={getOperatorBrand(station.operator, brands)}
          isCurrent={station.id === stationId}
          onSelect={selectStation}
          onPrefetch={onPrefetch}
        />
      ))}
    </nav>
  );
}

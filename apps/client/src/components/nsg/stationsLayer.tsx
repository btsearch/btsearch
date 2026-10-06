import { useQuery } from "@tanstack/react-query";
import { memo, useMemo } from "react";

import { useMap } from "@/components/ui/map";
import { mapLocationsQueryOptions } from "@/features/map/api";
import { StationsLayer as MapStationsLayer } from "@/features/map/components/stationsLayer";
import { DEFAULT_MAP_FILTERS, type MapFilters } from "@/features/map/data/mapFilters";
import { type MapLookups, findOperatorIdsByMncs, useMapLookups } from "@/features/map/data/mapLookups";
import { useMapPoints } from "@/features/map/data/mapPoints";
import { useMapBounds } from "@/features/map/hooks/useMapBounds";
import { useMapQueryHousekeeping } from "@/features/map/hooks/useMapQueryHousekeeping";
import { useStationPopupActions } from "@/features/map/hooks/useStationPopupActions";
import type { MatchedStation } from "@/features/nsg-explorer/stations/correlation";
import { mergeMatchedStationPoints } from "@/features/nsg-explorer/stations/locations";
import { createStationsQueryScope, isStationsQueryScope, retainStationsPlaceholder } from "@/features/nsg-explorer/stations/queryScope";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";

const LOCATION_QUERY_FAMILIES = new Set(["locations"]);

function isStationsLayerQuery(queryKey: readonly unknown[]): boolean {
  return isStationsQueryScope(queryKey.at(-1));
}

function buildOperatorFilters(operatorMncs: readonly number[], lookups: MapLookups | undefined, visible: boolean): MapFilters {
  if (lookups === undefined) return { ...DEFAULT_MAP_FILTERS, showStations: visible };

  const operatorIds = findOperatorIdsByMncs(lookups.operators, operatorMncs);
  const countryCodes = new Set<string>();
  for (const operatorId of operatorIds) {
    const entry = lookups.operatorsById.get(operatorId);
    if (entry !== undefined) countryCodes.add(entry.operator.countryCode);
  }

  return { ...DEFAULT_MAP_FILTERS, operatorIds, countryCodes: [...countryCodes], showStations: visible };
}

type StationsLayerProps = {
  operatorMncs: readonly number[];
  correlationKey: string | null;
  stationSourceMatches: readonly MatchedStation[];
  visible: boolean;
};

export const StationsLayer = memo(function StationsLayer({ operatorMncs, correlationKey, stationSourceMatches, visible }: StationsLayerProps) {
  const { map, isLoaded } = useMap();
  const { bounds, zoom, isMoving } = useMapBounds({ map, isLoaded });
  const { preferences } = usePreferences();
  const { data: runtimeSettings } = useSettings();
  const { data: session } = useSettledSession();
  const { lookups } = useMapLookups();
  const showAddToList = !!session?.user && !!runtimeSettings?.features.lists;
  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const filters = useMemo(() => buildOperatorFilters(operatorMncs, lookups, visible), [operatorMncs, lookups, visible]);
  useMapQueryHousekeeping({ bounds, isMoving, queryFamilies: LOCATION_QUERY_FAMILIES, isInScope: isStationsLayerQuery });

  const queryScope = createStationsQueryScope(correlationKey, operatorMncs);
  const { data: page } = useQuery({
    ...mapLocationsQueryOptions({
      bounds,
      request: { filters, lookups, limit: preferences.mapStationsLimit, wantAzimuths },
      scope: queryScope,
    }),
    enabled: visible && isLoaded && bounds !== "" && !isMoving && filters.operatorIds.length > 0,
    placeholderData: (previous, previousQuery) => retainStationsPlaceholder(previous, previousQuery?.queryKey, queryScope),
  });
  const queriedPoints = useMapPoints(page, lookups);
  const points = useMemo(
    () => (lookups === undefined ? queriedPoints : mergeMatchedStationPoints(queriedPoints, stationSourceMatches, lookups)),
    [queriedPoints, stationSourceMatches, lookups],
  );

  const { openLocations, popupContents, popupActions, stationActions } = useStationPopupActions({
    map,
    showAddToList,
    allowMultipleMapPopups: preferences.allowMultipleMapPopups,
    closeMapPopupsOnMapClick: preferences.closeMapPopupsOnMapClick,
    statusFilter: filters.status,
  });

  return (
    <>
      {popupContents}
      <MapStationsLayer
        filters={filters}
        points={points}
        wantAzimuths={wantAzimuths}
        stationActions={stationActions}
        popupActions={popupActions}
        activePopupLocations={openLocations}
        urlSyncEnabled={false}
      />
    </>
  );
});

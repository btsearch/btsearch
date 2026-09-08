import { useQuery } from "@tanstack/react-query";
import { memo, useMemo } from "react";

import { useMap } from "@/components/ui/map";
import { type LocationsResponse, fetchLocations } from "@/features/map/api";
import { DEFAULT_FILTERS, StationsLayer as MapStationsLayer } from "@/features/map/components/stationsLayer";
import { useMapBounds } from "@/features/map/hooks/useMapBounds";
import { useMapQueryHousekeeping } from "@/features/map/hooks/useMapQueryHousekeeping";
import { useStationPopupActions } from "@/features/map/hooks/useStationPopupActions";
import type { MatchedStation } from "@/features/nsg-explorer/stations/correlation";
import { mergeMatchedStationLocations } from "@/features/nsg-explorer/stations/locations";
import { createStationsQueryScope, isStationsQueryScope, retainStationsPlaceholder } from "@/features/nsg-explorer/stations/queryScope";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import type { StationFilters } from "@/types/station";

const LOCATION_QUERY_FAMILIES = new Set(["locations"]);

function isStationsLayerQuery(queryKey: readonly unknown[]): boolean {
  return isStationsQueryScope(queryKey.at(-1));
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
  const { data: session } = authClient.useSession();
  const showAddToList = !!session?.user && !!runtimeSettings?.enableUserLists;
  const wantAzimuths = preferences.showAzimuths && zoom >= preferences.azimuthsMinZoom;
  const filters = useMemo<StationFilters>(
    () => ({ ...DEFAULT_FILTERS, operators: [...operatorMncs], showStations: visible }),
    [operatorMncs, visible],
  );
  const queryScope = useMemo(() => createStationsQueryScope(correlationKey, operatorMncs), [correlationKey, operatorMncs]);
  useMapQueryHousekeeping({ bounds, isMoving, queryFamilies: LOCATION_QUERY_FAMILIES, isInScope: isStationsLayerQuery });

  const { data: queriedLocationsResponse } = useQuery({
    queryKey: ["locations", bounds, filters, preferences.mapStationsLimit, wantAzimuths, queryScope],
    queryFn: ({ signal }) =>
      fetchLocations(bounds, filters, preferences.mapStationsLimit, {
        azimuths: wantAzimuths,
        signal,
      }),
    enabled: visible && isLoaded && bounds.length > 0 && !isMoving && operatorMncs.length > 0,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60,
    placeholderData: (previous, previousQuery) => retainStationsPlaceholder(previous, previousQuery?.queryKey, queryScope),
  });
  const locationsResponse = useMemo<LocationsResponse>(() => {
    const data = mergeMatchedStationLocations(queriedLocationsResponse?.data ?? [], stationSourceMatches);
    return {
      data,
      totalCount: Math.max(queriedLocationsResponse?.totalCount ?? 0, data.length),
    };
  }, [queriedLocationsResponse, stationSourceMatches]);

  const { openLocations, popupActions, stationActions } = useStationPopupActions({
    map,
    showAddToList,
    allowMultipleMapPopups: preferences.allowMultipleMapPopups,
    closeMapPopupsOnMapClick: preferences.closeMapPopupsOnMapClick,
    detailsFilters: filters,
  });

  return (
    <MapStationsLayer
      filters={filters}
      locationsResponse={locationsResponse}
      zoom={zoom}
      stationActions={stationActions}
      popupActions={popupActions}
      activePopupLocations={openLocations}
      urlSyncEnabled={false}
    />
  );
});

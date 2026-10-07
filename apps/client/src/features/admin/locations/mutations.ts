import type { LocationUpdate } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteLocation, patchLocation } from "./api";
import { invalidateStationUpdateQueriesBatch } from "@/features/admin/stations/queries";
import type { StationUpdateImpact } from "@/features/admin/stations/queries";
import type { LocationRecord } from "@/features/station-details/station/types";

export function usePatchLocationMutation(locationId: number, location?: LocationRecord) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LocationUpdate) => patchLocation(locationId, body),
    onSuccess: (updated) => {
      const locationMoved = location === undefined || updated.latitude !== location.latitude || updated.longitude !== location.longitude;
      const locationMetadataChanged =
        location === undefined ||
        updated.regionId !== location.regionId ||
        updated.city !== location.city ||
        updated.address !== location.address ||
        updated.structure.type !== location.structure.type ||
        updated.structure.owner?.id !== location.structure.owner?.id ||
        updated.structure.note !== location.structure.note;
      const stationIds = location?.stations.map((station) => station.id) ?? [];
      const impacts = (stationIds.length > 0 ? stationIds : [null]).map((stationId): StationUpdateImpact => ({
        stationId,
        oldLocationId: locationId,
        newLocationId: locationId,
        stationMetadataChanged: false,
        locationMetadataChanged,
        locationMoved,
        cellsChanged: false,
        cellCountChanged: false,
        sectorsChanged: false,
        extraIdsChanged: false,
        uplinkChanged: false,
      }));
      invalidateStationUpdateQueriesBatch(queryClient, impacts);

      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "location", String(locationId)] }),
        queryClient.invalidateQueries({ queryKey: ["admin-locations-list"] }),
      ]);
    },
  });
}

export function useDeleteLocationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locationId: number) => deleteLocation(locationId),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: ["admin-locations-list"] });
    },
  });
}

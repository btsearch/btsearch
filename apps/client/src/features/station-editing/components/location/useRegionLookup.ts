import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { regionAtQueryOptions, toPlacePoint } from "../../data/places";
import type { StationDraftApi } from "../../hooks/useStationDraft";
import { isMarkerMoved } from "../../model/changes";
import type { PlaceDraft } from "../../model/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const LOOKUP_DELAY_MS = 400;

function sitsOnKnownPlace(place: PlaceDraft, livePlace: PlaceDraft | null): boolean {
  if (place.locationId === null) return false;
  if (livePlace === null) return true;
  return !isMarkerMoved(place, livePlace) || place.locationId !== livePlace.locationId;
}

export function useRegionLookup(edit: StationDraftApi): number | null {
  const { session, dispatch, canEdit } = edit;
  const { place } = session.draft;
  const livePlace = session.live?.place ?? null;
  const latitude = place?.latitude ?? null;
  const longitude = place?.longitude ?? null;
  const regionId = place?.regionId ?? null;
  const isRegionPicked = place?.isRegionPicked === true;
  const lookupLatitude = useDebouncedValue(latitude, LOOKUP_DELAY_MS);
  const lookupLongitude = useDebouncedValue(longitude, LOOKUP_DELAY_MS);
  const lookupPoint = toPlacePoint(lookupLatitude, lookupLongitude);
  const isLookupCurrent = lookupLatitude === latitude && lookupLongitude === longitude;
  const restsOnFreeSpot = canEdit && place !== null && isLookupCurrent && !sitsOnKnownPlace(place, livePlace);
  const { data: region } = useQuery({ ...regionAtQueryOptions(lookupPoint), enabled: restsOnFreeSpot });
  const regionAtId = restsOnFreeSpot && lookupPoint !== null ? (region?.id ?? null) : null;

  useEffect(() => {
    if (regionAtId === null || isRegionPicked || regionAtId === regionId) return;
    dispatch({ type: "setPlace", patch: { regionId: regionAtId, isRegionPicked: false } });
  }, [regionAtId, isRegionPicked, regionId, dispatch]);

  return regionAtId;
}

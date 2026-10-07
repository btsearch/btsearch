import type { StationSource } from "@/types/station";

type MapLinkPlace = {
  latitude: number;
  longitude: number;
};

type MapLinkLocation = MapLinkPlace & {
  id: number;
};

const MAP_LINK_ZOOM = 16;
const SOURCE_FLAGS: Record<StationSource, string> = { internal: "f", uke: "fu" };

function getPlaceHash({ latitude, longitude }: MapLinkPlace): string {
  return `map=${MAP_LINK_ZOOM}/${latitude}/${longitude}`;
}

export function getLocationMapHash(location: MapLinkLocation, source: StationSource = "internal"): string {
  return `${getPlaceHash(location)}~${SOURCE_FLAGS[source]}~L${location.id}`;
}

export function getStationMapHash(stationId: number, place: MapLinkPlace): string {
  return `${getPlaceHash(place)}~${SOURCE_FLAGS.internal}~S${stationId}`;
}

export function getOfficialSiteMapHash(officialSiteId: number, place: MapLinkPlace): string {
  return `${getPlaceHash(place)}~${SOURCE_FLAGS.uke}~U${officialSiteId}`;
}

import type { StationCoverageRequest } from "./crowd/coverage/coverageStore";
import type { StationSource } from "@/types/station";

type MapLinkPlace = {
  latitude: number;
  longitude: number;
};

type MapLinkLocation = MapLinkPlace & {
  id: number;
};

const MAP_LINK_ZOOM = 16;
const SOURCE_FLAGS: Record<StationSource, string> = { internal: "f", official: "fu" };
const TRAILING_COMMAS = /,+$/;

export const UNKNOWN_COVERAGE_BAND_TOKEN = "u";

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
  return `${getPlaceHash(place)}~${SOURCE_FLAGS.official}~U${officialSiteId}`;
}

export function getObservedSiteMapHash(observedSiteId: number, place: MapLinkPlace): string {
  return `${getPlaceHash(place)}~${SOURCE_FLAGS.internal}~E${observedSiteId}`;
}

function getCoverageBandToken(bandId: StationCoverageRequest["bandId"]): string {
  if (bandId === undefined) return "";
  return bandId === null ? UNKNOWN_COVERAGE_BAND_TOKEN : String(bandId);
}

export function getStationCoverageMapHash({ stationId, bandId, observedCellId }: StationCoverageRequest, place: MapLinkPlace): string {
  const value = [stationId, getCoverageBandToken(bandId), observedCellId ?? ""].join(",").replace(TRAILING_COMMAS, "");
  return `${getPlaceHash(place)}~${SOURCE_FLAGS.internal}~C${value}`;
}

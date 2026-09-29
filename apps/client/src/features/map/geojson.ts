import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";

import { type DuplexRadioLink, getRadioLineMnc } from "./utils";
import { getOperatorColor } from "@/lib/cellular/operators";
import type { LocationWithStations, StationSource, UkeLocationWithPermits } from "@/types/station";

export const DEFAULT_COLOR = "#3b82f6";

type OperatorMnc = number | null | undefined;

export function getOperatorData(mncs: OperatorMnc[]) {
  const uniqueMncs = [...new Set(mncs)].filter((mnc) => mnc !== undefined);
  const operators = uniqueMncs.filter((mnc): mnc is number => mnc !== null).sort((a, b) => a - b);
  const hasNullOperator = uniqueMncs.some((mnc) => mnc === null);
  const isMultiOperator = operators.length + (hasNullOperator ? 1 : 0) > 1;

  return {
    operators,
    hasNullOperator,
    isMultiOperator,
    pieImageId: isMultiOperator ? `pie-${operators.join("-")}${hasNullOperator ? "-null" : ""}` : undefined,
    color: operators.length > 0 ? getOperatorColor(operators[0]) : DEFAULT_COLOR,
  };
}

export function createPointFeature(lng: number, lat: number, properties: GeoJsonProperties): Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties,
  };
}

export function locationsToGeoJSON(locations: LocationWithStations[], source: StationSource): FeatureCollection {
  const features: Feature[] = [];

  for (const location of locations) {
    if (location.latitude === null || location.latitude === undefined || location.longitude === null || location.longitude === undefined) continue;
    if (!location.stations?.length) continue;

    const { operators, hasNullOperator, isMultiOperator, pieImageId, color } = getOperatorData(location.stations.map((s) => s.operator?.mnc));
    const status = new Set(location.stations.map((s) => s.status)).size === 1 ? location.stations[0].status : undefined;
    const hasStatusOutline = status === "pending" || status === "inactive";

    features.push(
      createPointFeature(location.longitude, location.latitude, {
        locationId: location.id,
        source,
        city: location.city,
        address: location.address,
        stationCount: location.stations.length,
        operatorCount: operators.length,
        operators: JSON.stringify(operators),
        hasNullOperator,
        color,
        isMultiOperator,
        pieImageId: pieImageId && hasStatusOutline ? `${pieImageId}-${status}` : pieImageId,
        status,
      }),
    );
  }

  return { type: "FeatureCollection", features };
}

export function ukeLocationsToGeoJSON(locations: UkeLocationWithPermits[], source: StationSource): FeatureCollection {
  const features: Feature[] = [];

  for (const location of locations) {
    if (location.latitude === null || location.latitude === undefined || location.longitude === null || location.longitude === undefined) continue;
    if (!location.stations?.length) continue;

    const { operators, hasNullOperator, isMultiOperator, pieImageId, color } = getOperatorData(location.stations.map((s) => s.operator?.mnc));

    features.push(
      createPointFeature(location.longitude, location.latitude, {
        locationId: location.id,
        source,
        city: location.city,
        address: location.address,
        stationCount: location.stations.length,
        operatorCount: operators.length,
        operators: JSON.stringify(operators),
        hasNullOperator,
        color,
        isMultiOperator,
        pieImageId,
      }),
    );
  }

  return { type: "FeatureCollection", features };
}

export function radioLinesToGeoJSON(links: DuplexRadioLink[]): {
  lines: FeatureCollection;
  endpoints: FeatureCollection;
} {
  const lineFeatures: Feature[] = [];
  const endpointFeatures: Feature[] = [];

  for (const link of links) {
    const mnc = getRadioLineMnc(link);
    const properties = {
      radioLineId: link.directions[0].id,
      color: mnc ? getOperatorColor(mnc) : DEFAULT_COLOR,
      isExpired: link.isExpired,
    };

    lineFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [link.a.longitude, link.a.latitude],
          [link.b.longitude, link.b.latitude],
        ],
      },
      properties,
    });

    endpointFeatures.push(
      createPointFeature(link.a.longitude, link.a.latitude, properties),
      createPointFeature(link.b.longitude, link.b.latitude, properties),
    );
  }

  return {
    lines: { type: "FeatureCollection", features: lineFeatures },
    endpoints: { type: "FeatureCollection", features: endpointFeatures },
  };
}

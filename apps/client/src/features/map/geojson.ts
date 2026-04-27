import { getOperatorColor, resolveOperatorMnc } from "@/lib/operatorUtils";
import type { LocationWithStations, RadioLine, StationSource, UkeLocationWithPermits } from "@/types/station";

import {
  calculateDistance,
  calculateLinkDirectionalSpeeds,
  calculateRadiolineSpeed,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
  groupRadioLinesIntoLinks,
} from "./utils";

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

export function createPointFeature(lng: number, lat: number, properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties,
  };
}

export function locationsToGeoJSON(locations: LocationWithStations[], source: StationSource): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const location of locations) {
    if (location.latitude == null || location.longitude == null || !location.stations?.length) continue;

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

export function ukeLocationsToGeoJSON(locations: UkeLocationWithPermits[], source: StationSource): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const location of locations) {
    if (location.latitude == null || location.longitude == null || !location.permits?.length) continue;

    const { operators, hasNullOperator, isMultiOperator, pieImageId, color } = getOperatorData(location.permits.map((p) => p.operator?.mnc));

    features.push(
      createPointFeature(location.longitude, location.latitude, {
        locationId: location.id,
        source,
        city: location.city,
        address: location.address,
        stationCount: location.permits.length,
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

export function radioLinesToGeoJSON(radioLines: RadioLine[]): {
  lines: GeoJSON.FeatureCollection;
  endpoints: GeoJSON.FeatureCollection;
} {
  const links = groupRadioLinesIntoLinks(radioLines);
  const lineFeatures: GeoJSON.Feature[] = [];
  const endpointFeatures: GeoJSON.Feature[] = [];

  for (const link of links) {
    const first = link.directions[0];
    const mnc = resolveOperatorMnc(first.operator?.mnc, first.operator?.name);
    const color = mnc ? getOperatorColor(mnc) : DEFAULT_COLOR;
    const distance = calculateDistance(link.a.latitude, link.a.longitude, link.b.latitude, link.b.longitude);
    const distanceFormatted = formatDistance(distance);

    const { dl, ul } = calculateLinkDirectionalSpeeds(link);

    const directionsJson = JSON.stringify(
      link.directions.map((d) => {
        const calcSpeed = d.link.ch_width && d.link.modulation_type ? calculateRadiolineSpeed(d.link.ch_width, d.link.modulation_type) : null;
        return {
          freq: formatFrequency(d.link.freq),
          bandwidth: calcSpeed !== null ? formatSpeed(calcSpeed) : d.link.bandwidth ? formatBandwidth(d.link.bandwidth) : null,
          polarization: d.link.polarization ?? null,
          forward: d.tx.latitude === link.a.latitude && d.tx.longitude === link.a.longitude,
        };
      }),
    );

    lineFeatures.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [link.a.longitude, link.a.latitude],
          [link.b.longitude, link.b.latitude],
        ],
      },
      properties: {
        groupId: link.groupId,
        radioLineId: first.id,
        operatorName: first.operator?.name ?? "",
        operatorMnc: first.operator?.mnc ?? null,
        color,
        isExpired: link.isExpired,
        distanceFormatted,
        directionsJson,
        directionCount: link.directions.length,
        linkType: link.linkType,
        dlSpeed: dl !== null ? formatSpeed(dl) : null,
        ulSpeed: ul !== null ? formatSpeed(ul) : null,
      },
    });

    const sharedEndpointProps = {
      groupId: link.groupId,
      radioLineId: first.id,
      color,
      operatorName: first.operator?.name ?? "",
      operatorMnc: first.operator?.mnc ?? null,
      isExpired: link.isExpired,
      distanceFormatted,
      directionsJson,
      directionCount: link.directions.length,
      linkType: link.linkType,
      dlSpeed: dl !== null ? formatSpeed(dl) : null,
      ulSpeed: ul !== null ? formatSpeed(ul) : null,
    };

    endpointFeatures.push(
      createPointFeature(link.a.longitude, link.a.latitude, sharedEndpointProps),
      createPointFeature(link.b.longitude, link.b.latitude, sharedEndpointProps),
    );
  }

  return {
    lines: { type: "FeatureCollection", features: lineFeatures },
    endpoints: { type: "FeatureCollection", features: endpointFeatures },
  };
}

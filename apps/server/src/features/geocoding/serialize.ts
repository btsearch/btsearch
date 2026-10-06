import type { GeocodedPlace } from "@openbts/shared/contract";

import type { GeocodingResult, GeocodingSource } from "./types.js";

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export function toGeocodedPlace(result: GeocodingResult, source: GeocodingSource): GeocodedPlace {
  const countryCode = result.address.countryCode?.toUpperCase() ?? "";

  return {
    ...result,
    source,
    address: { ...result.address, countryCode: COUNTRY_CODE_PATTERN.test(countryCode) ? countryCode : null },
  };
}

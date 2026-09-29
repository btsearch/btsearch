const PADDED_NUMERIC_STATION_ID = /^0\d+$/;
const LEADING_ZEROS = /^0+(?=\d)/;

export function normalizeStationId(stationId: string): string {
  const trimmed = stationId.trim();
  if (!PADDED_NUMERIC_STATION_ID.test(trimmed)) return trimmed;
  return trimmed.replace(LEADING_ZEROS, "");
}

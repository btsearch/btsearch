export function getHardwareLeaseOperator(stationId: string, mnc?: number | null): string | null {
  if (stationId.startsWith("N")) {
    if (mnc === 26003) return "T-Mobile";
    if (mnc === 26002) return "Orange";
  }
  return null;
}

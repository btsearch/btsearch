import type { Operator, Station } from "@/types/station";

export function getHardwareLeaseOperator(
  station: Pick<Station, "station_id" | "operator" | "physicalStation">,
): Pick<Operator, "name" | "mnc"> | null {
  if (station.physicalStation) return station.physicalStation.operator;
  if (station.station_id.startsWith("N")) {
    const mnc = station.operator?.mnc;
    if (mnc === 26003) return { name: "T-Mobile", mnc: 26002 };
    if (mnc === 26002) return { name: "Orange", mnc: 26003 };
  }
  return null;
}

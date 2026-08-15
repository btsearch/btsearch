import { fetchApiData } from "@/lib/api";
import type { Band, Operator, Region } from "@/types/station";

export const fetchOperators = () => fetchApiData<Operator[]>("operators");

export const fetchBands = () => fetchApiData<Band[]>("bands");

export const fetchRegions = () => fetchApiData<Region[]>("regions");

export const fetchSI2PEMAzimuths = (stationId: string, latitude: number, longitude: number) => {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  return fetchApiData<number[]>(`pem/${encodeURIComponent(stationId)}/azimuths?${params.toString()}`);
};

export type UkeOperator = { id: number; name: string; full_name: string };
export const fetchUkeRadioLineOperators = () => fetchApiData<UkeOperator[]>("uke/radiolines/operators");

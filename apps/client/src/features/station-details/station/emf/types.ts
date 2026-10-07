export type { EmfAntenna, EmfAntennaBand, EmfAntennaReport, EmfReport } from "@openbts/shared/contract";

export type EmfSite = { stationId: number } | { officialSiteId: number };
export type EmfSitePlace = { city: string | null; address: string | null };

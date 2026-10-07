import { queryOptions } from "@tanstack/react-query";

import { toEmfSiteParams } from "./site";
import type { EmfAntennaReport, EmfReport, EmfSite } from "./types";
import { ApiResponseError, BackendUnavailableError, fetchV2Data } from "@/lib/api";

const EMF_REPORTS_STALE_TIME = 1000 * 60 * 60;
const EMF_ANTENNAS_STALE_TIME = 1000 * 60 * 60 * 24;
const EMF_ANTENNAS_GC_TIME = EMF_ANTENNAS_STALE_TIME;
const NOT_FOUND_STATUS = 404;
const REGISTER_UNAVAILABLE_STATUS = 503;

const emfKeys = {
  reports: (site: EmfSite) => ["station-pem", "v2", site] as const,
  antennas: (site: EmfSite, reportUrl: string) => ["si2pem-report-antennas", "v2", site, reportUrl] as const,
};

export class EmfRegisterUnavailableError extends Error {
  constructor() {
    super("The EMF register is not answering.");
  }
}

async function fetchEmfData<T>(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  try {
    return await fetchV2Data<T>(`emf/${path}?${params.toString()}`, { signal });
  } catch (error) {
    if (error instanceof BackendUnavailableError && error.status === REGISTER_UNAVAILABLE_STATUS) throw new EmfRegisterUnavailableError();
    throw error;
  }
}

async function fetchEmfReports(site: EmfSite, signal?: AbortSignal): Promise<EmfReport[]> {
  try {
    return await fetchEmfData<EmfReport[]>("reports", toEmfSiteParams(site), signal);
  } catch (error) {
    if (error instanceof ApiResponseError && error.status === NOT_FOUND_STATUS) return [];
    throw error;
  }
}

function fetchEmfAntennas(site: EmfSite, reportUrl: string, signal?: AbortSignal): Promise<EmfAntennaReport> {
  const params = toEmfSiteParams(site);
  params.set("reportUrl", reportUrl);
  return fetchEmfData<EmfAntennaReport>("antennas", params, signal);
}

export function emfReportsQueryOptions(site: EmfSite) {
  return queryOptions({
    queryKey: emfKeys.reports(site),
    queryFn: ({ signal }) => fetchEmfReports(site, signal),
    staleTime: EMF_REPORTS_STALE_TIME,
    retry: false,
  });
}

export function emfAntennasQueryOptions(site: EmfSite, reportUrl: string) {
  return queryOptions({
    queryKey: emfKeys.antennas(site, reportUrl),
    queryFn: ({ signal }) => fetchEmfAntennas(site, reportUrl, signal),
    staleTime: EMF_ANTENNAS_STALE_TIME,
    gcTime: EMF_ANTENNAS_GC_TIME,
    retry: false,
  });
}

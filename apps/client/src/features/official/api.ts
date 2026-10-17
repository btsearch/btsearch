import type {
  LicenseeList,
  LicenseeListQuery,
  MicrowaveLink,
  MicrowaveLinkInclude,
  MicrowaveLinkList,
  MicrowaveLinkListQuery,
  OfficialBandLabel,
  OfficialLocationList,
  OfficialLocationListQuery,
  OfficialPermitList,
  OfficialPermitListQuery,
  OfficialSite,
  OfficialSiteInclude,
  OfficialSiteList,
  OfficialSiteListQuery,
  OfficialSiteWatch,
  OfficialSource,
} from "@openbts/shared/contract";

import { API_V2_BASE, appendList, fetchJson, fetchV2Data } from "@/lib/api";

type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;
type QueryParams = Readonly<Record<string, QueryValue>>;
type BboxListParams<ListQuery> = Partial<Omit<ListQuery, "bbox">> & { bbox?: string };

export type OfficialLocationListParams = BboxListParams<OfficialLocationListQuery>;
type OfficialSiteListParams = BboxListParams<OfficialSiteListQuery>;
export type OfficialPermitListParams = BboxListParams<OfficialPermitListQuery>;
export type MicrowaveLinkListParams = BboxListParams<MicrowaveLinkListQuery>;
export type LicenseeListParams = Partial<LicenseeListQuery>;

function withQuery(path: string, query: QueryParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) appendList(params, key, value);
    else if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search === "" ? path : `${path}?${search}`;
}

function fetchV2Page<Page>(path: string, query: QueryParams, signal?: AbortSignal): Promise<Page> {
  return fetchJson<Page>(`${API_V2_BASE}/${withQuery(path, query)}`, { signal });
}

export function fetchOfficialSources(signal?: AbortSignal): Promise<OfficialSource[]> {
  return fetchV2Data<OfficialSource[]>("official/sources", { signal });
}

export function fetchOfficialBandLabels(signal?: AbortSignal): Promise<OfficialBandLabel[]> {
  return fetchV2Data<OfficialBandLabel[]>("official/band-labels", { signal });
}

export function fetchOfficialLocations(query: OfficialLocationListParams, signal?: AbortSignal): Promise<OfficialLocationList> {
  return fetchV2Page<OfficialLocationList>("official/locations", query, signal);
}

export function fetchOfficialSites(query: OfficialSiteListParams, signal?: AbortSignal): Promise<OfficialSiteList> {
  return fetchV2Page<OfficialSiteList>("official/sites", query, signal);
}

export function fetchOfficialSite(id: number, include: readonly OfficialSiteInclude[], signal?: AbortSignal): Promise<OfficialSite> {
  return fetchV2Data<OfficialSite>(withQuery(`official/sites/${id}`, { include }), { signal });
}

export function fetchOfficialPermits(query: OfficialPermitListParams, signal?: AbortSignal): Promise<OfficialPermitList> {
  return fetchV2Page<OfficialPermitList>("official/permits", query, signal);
}

export function fetchOfficialMicrowaveLinks(query: MicrowaveLinkListParams, signal?: AbortSignal): Promise<MicrowaveLinkList> {
  return fetchV2Page<MicrowaveLinkList>("official/microwave-links", query, signal);
}

export function fetchOfficialMicrowaveLink(id: number, include: readonly MicrowaveLinkInclude[], signal?: AbortSignal): Promise<MicrowaveLink> {
  return fetchV2Data<MicrowaveLink>(withQuery(`official/microwave-links/${id}`, { include }), { signal });
}

export function fetchLicensees(query: LicenseeListParams, signal?: AbortSignal): Promise<LicenseeList> {
  return fetchV2Page<LicenseeList>("official/licensees", query, signal);
}

export async function fetchIsOfficialSiteWatched(id: number, signal?: AbortSignal): Promise<boolean> {
  const watch = await fetchV2Data<OfficialSiteWatch>(`official/sites/${id}/watch`, { signal });
  return watch.isWatched;
}

export async function watchOfficialSite(id: number): Promise<void> {
  await fetchJson(`${API_V2_BASE}/official/sites/${id}/watch`, { method: "PUT" });
}

export async function unwatchOfficialSite(id: number): Promise<void> {
  await fetchJson(`${API_V2_BASE}/official/sites/${id}/watch`, { method: "DELETE" });
}

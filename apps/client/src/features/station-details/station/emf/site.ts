import type { EmfSite } from "./types";

export function toEmfSiteParams(site: EmfSite): URLSearchParams {
  if ("stationId" in site) return new URLSearchParams({ stationId: String(site.stationId) });
  return new URLSearchParams({ officialSiteId: String(site.officialSiteId) });
}

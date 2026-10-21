import type { OfficialSite } from "@openbts/shared/contract";

export function getOfficialSiteCode(site: Pick<OfficialSite, "siteId" | "sourceRef">): string | null {
  return site.siteId ?? site.sourceRef;
}

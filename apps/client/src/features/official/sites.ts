import type { OfficialSite, OfficialSitePermit } from "@openbts/shared/contract";

import { foldText } from "@/lib/foldText";

export function getOfficialSiteCode(site: Pick<OfficialSite, "siteId" | "sourceRef">): string | null {
  return site.siteId ?? site.sourceRef;
}

export function findMatchedPermitNumber(permits: readonly Pick<OfficialSitePermit, "number">[], query: string): string | undefined {
  const foldedQuery = foldText(query);
  if (foldedQuery === "") return undefined;

  const permitNumbers = permits.flatMap(({ number }) => (number === null ? [] : [number]));
  return permitNumbers.find((number) => foldText(number).includes(foldedQuery));
}

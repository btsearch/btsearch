import type { Operator } from "@openbts/shared/contract";
import { getNetworksSiblingMnc } from "@openbts/shared/operatorUtils";

import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { fetchApiData } from "@/lib/api";
import { resolveSiblingMnoName } from "@/lib/cellular/stations";

type PartnerIdentifiers = {
  networksId: string | null;
  networksName: string | null;
  operatorName: string | null;
};

type PartnerIdentifierRow = {
  networks_id: number | null;
  networks_name: string | null;
  mno_name: string | null;
};

type PartnerSector = {
  id: number;
  azimuth: number;
};

type PlmnOperator = Pick<Operator, "primaryPlmn">;

export function findPartnerOperator(operator: PlmnOperator | null, operators: readonly Operator[]): Operator | null {
  const partnerMnc = getNetworksSiblingMnc(toV1OperatorMnc(operator));
  if (partnerMnc === null) return null;
  return operators.find((candidate) => toV1OperatorMnc(candidate) === partnerMnc) ?? null;
}

export function resolveOwnNameFromPartner(
  operator: PlmnOperator | null,
  siteId: string,
  city: string | null,
  partnerName: string | null,
): string | null {
  return resolveSiblingMnoName(toV1OperatorMnc(operator), siteId, city, partnerName);
}

export async function fetchPartnerIdentifiers(stationId: number): Promise<PartnerIdentifiers> {
  const row = await fetchApiData<PartnerIdentifierRow>(`stations/${stationId}/extra-identifiers/sibling`);

  return {
    networksId: row.networks_id === null ? null : String(row.networks_id),
    networksName: row.networks_name,
    operatorName: row.mno_name,
  };
}

export function fetchPartnerSectors(stationId: number): Promise<PartnerSector[]> {
  return fetchApiData<PartnerSector[]>(`stations/${stationId}/sectors/sibling`);
}

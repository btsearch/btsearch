import type { Operator, Sector, Station } from "@openbts/shared/contract";

import { findStationIdentifier, listSharedNetworkIds } from "@/features/station-details/station/utils/stations";
import { fetchV2Data } from "@/lib/api";

type PartnerIdentifiers = {
  networksId: string | null;
  networksName: string | null;
  operatorName: string | null;
};

type LinkedOperator = Pick<Operator, "id" | "countryCode" | "links">;
type PartnerStation = Pick<Station, "identifiers"> & { sectors: Sector[] };

const PARTNER_STATION_INCLUDE = "sectors";

export function listPartnerOperators(operator: LinkedOperator | null, operators: readonly Operator[]): Operator[] {
  if (operator === null) return [];

  const sharedNetworkIds = new Set(listSharedNetworkIds(operator));
  return operators.filter(
    (candidate) =>
      candidate.id !== operator.id &&
      candidate.countryCode === operator.countryCode &&
      listSharedNetworkIds(candidate).some((networkId) => sharedNetworkIds.has(networkId)),
  );
}

export function findPartnerOperator(operator: LinkedOperator | null, operators: readonly Operator[]): Operator | null {
  return listPartnerOperators(operator, operators).at(0) ?? null;
}

async function fetchPartnerStation(stationId: number): Promise<PartnerStation | null> {
  const siblings = await fetchV2Data<PartnerStation[]>(`stations/${stationId}/siblings?include=${PARTNER_STATION_INCLUDE}`);
  return siblings.at(0) ?? null;
}

export async function fetchPartnerIdentifiers(stationId: number): Promise<PartnerIdentifiers> {
  const partnerStation = await fetchPartnerStation(stationId);
  const identifiers = partnerStation?.identifiers ?? [];

  return {
    networksId: findStationIdentifier(identifiers, "networksId"),
    networksName: findStationIdentifier(identifiers, "networksName"),
    operatorName: findStationIdentifier(identifiers, "operatorName"),
  };
}

export async function fetchPartnerSectors(stationId: number): Promise<Sector[]> {
  const partnerStation = await fetchPartnerStation(stationId);
  return partnerStation?.sectors ?? [];
}

import type { StationIdentifierKind } from "@openbts/shared/contract";
import { DEFAULT_GNBID_LENGTH } from "@openbts/shared/contract/constants";

export type OperatorRef = {
  id: number;
  primaryPlmn: string | null;
  sharedNetworkPlmns: readonly string[];
};

export type OperatorNameInput = {
  operator: OperatorRef;
  siteId: string;
  city: string | null;
  partnerName: string | null;
};

export type LteSectorRule = {
  clidStep: number;
  isSequenceStart: (ecid: number) => boolean;
  supportsFourthSector: boolean;
};

export type GeocodedPlaceNames = {
  region: string | null;
  municipality: string | null;
};

export type SharedSitePart = "backhaul" | "sectors" | "photos";

export type CountryConventions = {
  identifierKinds: (operator: OperatorRef) => readonly StationIdentifierKind[];
  formatIdentifier: (kind: StationIdentifierKind, value: string) => string;
  validateAddress: (address: string) => string | null;
  suggestOperatorName: (input: OperatorNameInput) => string | null;
  equivalentEnbids: (operator: OperatorRef, enbid: number) => number[];
  sharedSite: { copies: readonly SharedSitePart[] };
  lteSectorRule: (operator: OperatorRef) => LteSectorRule | null;
  gnbidLength: (operator: Pick<OperatorRef, "primaryPlmn">) => number;
  hoistedTac: boolean;
  normalizeGeocodedPlace: (place: GeocodedPlaceNames) => GeocodedPlaceNames;
};

export const defaultConventions: CountryConventions = {
  identifierKinds: () => [],
  formatIdentifier: (_kind, value) => value,
  validateAddress: () => null,
  suggestOperatorName: () => null,
  equivalentEnbids: (_operator, enbid) => [enbid],
  sharedSite: { copies: [] },
  lteSectorRule: () => null,
  gnbidLength: () => DEFAULT_GNBID_LENGTH,
  hoistedTac: false,
  normalizeGeocodedPlace: (place) => place,
};

export function gnbidLengthByPlmn(lengths: Partial<Record<string, number>>): CountryConventions["gnbidLength"] {
  return ({ primaryPlmn }) => (primaryPlmn === null ? undefined : lengths[primaryPlmn]) ?? DEFAULT_GNBID_LENGTH;
}

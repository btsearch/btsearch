import type { LteSectorRule, LteSequenceDigit, SharedAreaCode, StationIdentifierKind } from "@openbts/shared/contract";
import { DEFAULT_GNBID_LENGTH } from "@openbts/shared/contract/constants";

export type { LteSectorRule, SharedAreaCode };

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

export type GeocodedPlaceNames = {
  region: string | null;
  municipality: string | null;
};

export type SharedSitePart = "backhaul" | "sectors" | "photos";

export type CountryConventions = {
  identifierKinds: (operator: OperatorRef) => readonly StationIdentifierKind[];
  identifierPrefixes: Partial<Record<StationIdentifierKind, string>>;
  validateAddress: (address: string) => string | null;
  suggestOperatorName: (input: OperatorNameInput) => string | null;
  equivalentEnbids: (operator: OperatorRef, enbid: number) => number[];
  sharedSite: { copies: readonly SharedSitePart[] };
  lteSectorRule: (operator: OperatorRef) => LteSectorRule | null;
  gnbidLength: (operator: Pick<OperatorRef, "primaryPlmn">) => number;
  sharedAreaCode: SharedAreaCode;
  normalizeGeocodedPlace: (place: GeocodedPlaceNames) => GeocodedPlaceNames;
};

export const defaultConventions: CountryConventions = {
  identifierKinds: () => [],
  identifierPrefixes: {},
  validateAddress: () => null,
  suggestOperatorName: () => null,
  equivalentEnbids: (_operator, enbid) => [enbid],
  sharedSite: { copies: [] },
  lteSectorRule: () => null,
  gnbidLength: () => DEFAULT_GNBID_LENGTH,
  sharedAreaCode: { umts: true, lte: false, nr: false },
  normalizeGeocodedPlace: (place) => place,
};

export function gnbidLengthByPlmn(lengths: Partial<Record<string, number>>): CountryConventions["gnbidLength"] {
  return ({ primaryPlmn }) => (primaryPlmn === null ? undefined : lengths[primaryPlmn]) ?? DEFAULT_GNBID_LENGTH;
}

const ECI_DIGIT_PLACES = { ones: 1, tens: 10 } as const satisfies Record<LteSequenceDigit, number>;

export function isLteSequenceStart({ sequenceStart }: LteSectorRule, eci: number): boolean {
  return sequenceStart.values.includes(Math.floor(eci / ECI_DIGIT_PLACES[sequenceStart.eciDigit]) % 10);
}

export function formatIdentifier(
  { identifierPrefixes }: Pick<CountryConventions, "identifierPrefixes">,
  kind: StationIdentifierKind,
  value: string,
): string {
  return `${identifierPrefixes[kind] ?? ""}${value}`;
}

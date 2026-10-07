import type { LocationStationRecord, Operator, StationIdentifier, StationIdentifierKind, StationLocationRecord, StationStatus } from "../types";
import type { StationStatus as V1StationStatus } from "@/types/station";

type PlacedStation = {
  location: Pick<StationLocationRecord, "countryCode"> | null;
  operator: Pick<Operator, "countryCode"> | null;
};
type ListedStation = Pick<LocationStationRecord, "id" | "siteId" | "operator">;
type HostedStation = { hostStationId: number | null };
type IdentifiedStation = { id: number };
type AddressedLocation = Pick<StationLocationRecord, "city" | "address">;

export const NETWORKS_ID_KIND: StationIdentifierKind = "networksId";
export const EVERY_STATION_STATUS = "active,awaitingCells,inactive";

const V1_STATUSES: Record<StationStatus, V1StationStatus> = { active: "published", awaitingCells: "pending", inactive: "inactive" };
const V2_STATUSES: Record<V1StationStatus, StationStatus> = { published: "active", pending: "awaitingCells", inactive: "inactive" };
const V1_STATUSES_BY_NAME: ReadonlyMap<string, V1StationStatus> = new Map(Object.entries(V1_STATUSES));
const UNRANKED_OPERATOR = Number.MAX_SAFE_INTEGER;
const ADDRESS_SEPARATOR = ", ";

export function toV1StationStatus(status: StationStatus): V1StationStatus {
  return V1_STATUSES[status];
}

export function toV2StationStatus(status: V1StationStatus): StationStatus {
  return V2_STATUSES[status];
}

export function findV1StationStatus(status: string): V1StationStatus | undefined {
  return V1_STATUSES_BY_NAME.get(status);
}

export function toV1OperatorMnc(operator: Pick<Operator, "primaryPlmn"> | null): number | null {
  if (operator === null || operator.primaryPlmn === null) return null;
  return Number(operator.primaryPlmn);
}

export function getOperatorShortLabel(operator: Pick<Operator, "shortCode" | "name"> | null): string | null {
  return operator === null ? null : (operator.shortCode ?? operator.name);
}

export function getStationCountryCode(station: PlacedStation): string | null {
  return station.location?.countryCode ?? station.operator?.countryCode ?? null;
}

export function getLocationLabel(location: AddressedLocation): string | null {
  const parts = [location.city, location.address].filter(Boolean);
  return parts.length > 0 ? parts.join(ADDRESS_SEPARATOR) : null;
}

function getOperatorRank(station: ListedStation): number {
  return station.operator?.sortPriority ?? UNRANKED_OPERATOR;
}

function compareLocationStations(left: ListedStation, right: ListedStation): number {
  return (
    getOperatorRank(left) - getOperatorRank(right) ||
    Number(left.operator === null) - Number(right.operator === null) ||
    (left.operator?.name ?? "").localeCompare(right.operator?.name ?? "") ||
    left.siteId.localeCompare(right.siteId, undefined, { numeric: true }) ||
    left.id - right.id
  );
}

export function sortLocationStations<T extends ListedStation>(stations: readonly T[]): T[] {
  return [...stations].sort(compareLocationStations);
}

export function findHostStation<T extends IdentifiedStation>(station: HostedStation, locationStations: readonly T[] | undefined): T | null {
  if (station.hostStationId === null || locationStations === undefined) return null;
  return locationStations.find((candidate) => candidate.id === station.hostStationId) ?? null;
}

export function findStationIdentifier(identifiers: readonly StationIdentifier[], kind: StationIdentifierKind): string | null {
  return identifiers.find((identifier) => identifier.kind === kind)?.value ?? null;
}

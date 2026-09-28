import type { LocationPayload, ProposedLocationForm, StationPayload } from "../types";
import type { ProposedLocation, ProposedSector, ProposedStation } from "@/features/admin/submissions/types";
import type { Sector, SectorDraft, UplinkType } from "@/types/station";

export const PROPOSED_STATION_FIELDS = [
  "station_id",
  "operator_id",
  "notes",
  "networks_id",
  "networks_name",
  "mno_name",
  "uplink_type",
  "uplink_speed",
  "uplink_model",
] as const;
export const PROPOSED_LOCATION_FIELDS = ["region_id", "city", "address", "longitude", "latitude"] as const;

export type ProposedStationField = (typeof PROPOSED_STATION_FIELDS)[number];
export type ProposedLocationField = (typeof PROPOSED_LOCATION_FIELDS)[number];
export type ProposedStationChanges = Partial<Pick<ProposedStation, ProposedStationField>>;
export type ProposedLocationChanges = Partial<Pick<ProposedLocation, ProposedLocationField>>;

export type StationValues = {
  station_id: string;
  operator_id: number | null;
  notes: string;
  networks_id: number | null;
  networks_name: string;
  mno_name: string;
  uplink_type: UplinkType | null;
  uplink_speed: number | null;
  uplink_model: string;
};

type LiveStation = {
  station_id: string;
  operator_id: number | null;
  operator?: { id: number } | null;
  notes: string | null;
  extra_identificators?: { networks_id: number | null; networks_name: string | null; mno_name: string | null } | null;
  uplink?: { type: UplinkType; speed: number | null; model: string | null } | null;
};

type LiveLocation = { region?: { id: number } | null; city: string | null; address: string | null; longitude: number; latitude: number };

export const EMPTY_STATION_VALUES: StationValues = {
  station_id: "",
  operator_id: null,
  notes: "",
  networks_id: null,
  networks_name: "",
  mno_name: "",
  uplink_type: null,
  uplink_speed: null,
  uplink_model: "",
};

export function toStationValues(station: LiveStation): StationValues {
  return {
    station_id: station.station_id,
    operator_id: station.operator?.id ?? station.operator_id,
    notes: station.notes ?? "",
    networks_id: station.extra_identificators?.networks_id ?? null,
    networks_name: station.extra_identificators?.networks_name ?? "",
    mno_name: station.extra_identificators?.mno_name ?? "",
    uplink_type: station.uplink?.type ?? null,
    uplink_speed: station.uplink?.speed ?? null,
    uplink_model: station.uplink?.model ?? "",
  };
}

export function toLocationValues(location: LiveLocation | null): ProposedLocationForm {
  if (!location) return { region_id: null, city: "", address: "", longitude: null, latitude: null };
  return {
    region_id: location.region?.id ?? null,
    city: location.city ?? "",
    address: location.address ?? "",
    longitude: location.longitude,
    latitude: location.latitude,
  };
}

function textOrNull(value: string | undefined): string | null {
  return value?.trim() ? value : null;
}

function resolveChange<T>(change: T | undefined, current: T): T {
  return change === undefined ? current : change;
}

function pickChanges<T extends { changed_fields: F[] | null }, F extends keyof T>(proposal: T, fields: readonly F[]): Partial<Pick<T, F>> {
  const changedFields = proposal.changed_fields ?? fields.filter((field) => proposal[field] !== null && proposal[field] !== undefined);
  const changes: Partial<Pick<T, F>> = {};
  for (const field of changedFields) Object.assign(changes, { [field]: proposal[field] });
  return changes;
}

export function getProposedStationChanges(proposal: ProposedStation | null): ProposedStationChanges {
  return proposal ? pickChanges(proposal, PROPOSED_STATION_FIELDS) : {};
}

export function getProposedLocationChanges(proposal: ProposedLocation | null): ProposedLocationChanges {
  return proposal ? pickChanges(proposal, PROPOSED_LOCATION_FIELDS) : {};
}

export function applyProposedStation(current: StationValues, proposal: ProposedStation | null): StationValues {
  const changes = getProposedStationChanges(proposal);
  return {
    station_id: changes.station_id ?? current.station_id,
    operator_id: changes.operator_id ?? current.operator_id,
    notes: changes.notes ?? current.notes,
    networks_id: resolveChange(changes.networks_id, current.networks_id),
    networks_name: resolveChange(changes.networks_name, current.networks_name) ?? "",
    mno_name: resolveChange(changes.mno_name, current.mno_name) ?? "",
    uplink_type: resolveChange(changes.uplink_type, current.uplink_type),
    uplink_speed: resolveChange(changes.uplink_speed, current.uplink_speed),
    uplink_model: resolveChange(changes.uplink_model, current.uplink_model) ?? "",
  };
}

export function applyProposedLocation(current: ProposedLocationForm, proposal: ProposedLocation | null): ProposedLocationForm {
  const changes = getProposedLocationChanges(proposal);
  return {
    region_id: changes.region_id ?? current.region_id,
    city: resolveChange(changes.city, current.city ?? "") ?? "",
    address: resolveChange(changes.address, current.address ?? "") ?? "",
    longitude: changes.longitude ?? current.longitude,
    latitude: changes.latitude ?? current.latitude,
  };
}

export function toSectorDrafts(sectors: Sector[] | undefined): SectorDraft[] {
  return (sectors ?? []).map((sector) => ({ ...sector, _localId: `sector-${sector.id}` }));
}

function proposedSectorToDraft(sector: ProposedSector): SectorDraft {
  return { _localId: sector.local_id, id: sector.target_sector_id ?? undefined, azimuth: sector.azimuth };
}

export function proposedSectorDrafts(proposedSectors: ProposedSector[]): SectorDraft[] {
  return proposedSectors.filter((sector) => sector.operation !== "delete").map(proposedSectorToDraft);
}

export function applyProposedSectors(sectors: SectorDraft[], proposedSectors: ProposedSector[]): SectorDraft[] {
  if (proposedSectors.some((sector) => sector.operation === null)) return proposedSectors.map(proposedSectorToDraft);

  const changeById = new Map(
    proposedSectors.flatMap((sector) =>
      sector.operation !== "add" && sector.target_sector_id !== null ? [[sector.target_sector_id, sector] as const] : [],
    ),
  );
  return [
    ...sectors.flatMap((sector) => {
      const change = sector.id === undefined ? undefined : changeById.get(sector.id);
      if (change === undefined) return [sector];
      return change.operation === "delete" ? [] : [{ ...sector, azimuth: change.azimuth }];
    }),
    ...proposedSectors.filter((sector) => sector.operation === "add").map(proposedSectorToDraft),
  ];
}

export function diffStationValues(next: StationValues, current: StationValues): StationPayload {
  const changes: StationPayload = {};
  const stationId = next.station_id.trim();
  if (stationId !== "" && stationId !== current.station_id) changes.station_id = stationId;
  if (next.operator_id !== null && next.operator_id !== current.operator_id) changes.operator_id = next.operator_id;
  const notes = next.notes.trim();
  if (notes !== "" && notes !== current.notes.trim()) changes.notes = notes;
  if (next.networks_id !== current.networks_id) changes.networks_id = next.networks_id;
  if (textOrNull(next.networks_name) !== textOrNull(current.networks_name)) changes.networks_name = textOrNull(next.networks_name);
  if (textOrNull(next.mno_name) !== textOrNull(current.mno_name)) changes.mno_name = textOrNull(next.mno_name);
  if (next.uplink_type !== current.uplink_type) changes.uplink_type = next.uplink_type;
  if (next.uplink_speed !== current.uplink_speed) changes.uplink_speed = next.uplink_speed;
  if (textOrNull(next.uplink_model) !== textOrNull(current.uplink_model)) changes.uplink_model = textOrNull(next.uplink_model);
  return changes;
}

export function diffLocationValues(next: ProposedLocationForm, current: ProposedLocationForm): LocationPayload {
  const changes: LocationPayload = {};
  if (next.latitude !== current.latitude || next.longitude !== current.longitude) {
    changes.latitude = next.latitude;
    changes.longitude = next.longitude;
  }
  if (next.region_id !== null && next.region_id !== current.region_id) changes.region_id = next.region_id;
  if (textOrNull(next.city) !== textOrNull(current.city)) changes.city = textOrNull(next.city);
  if (textOrNull(next.address) !== textOrNull(current.address)) changes.address = textOrNull(next.address);
  return changes;
}

export function toStationPayload(values: StationValues): StationPayload {
  return {
    station_id: values.station_id,
    operator_id: values.operator_id,
    notes: textOrNull(values.notes),
    networks_id: values.networks_id,
    networks_name: textOrNull(values.networks_name),
    mno_name: textOrNull(values.mno_name),
    uplink_type: values.uplink_type,
    uplink_speed: values.uplink_speed,
    uplink_model: textOrNull(values.uplink_model),
  };
}

export function toLocationPayload(values: ProposedLocationForm): LocationPayload {
  return {
    region_id: values.region_id,
    city: textOrNull(values.city),
    address: textOrNull(values.address),
    longitude: values.longitude,
    latitude: values.latitude,
  };
}

export function hasPayloadChanges(payload: StationPayload | LocationPayload): boolean {
  return Object.keys(payload).length > 0;
}

import type { Cell, Location, LocationStation, Photo, PhotoSelection, Station, StationLocation } from "@openbts/shared/contract";

export type {
  Backhaul,
  Band,
  Brand,
  Cell,
  CellRat,
  CellType,
  Country,
  Me,
  NrMode,
  Operator,
  PhotoUpdate,
  Region,
  Sector,
  StationIdentifier,
  StationIdentifierKind,
  StationStatus,
  Structure,
  StructureOwnerRef,
  StructureType,
} from "@openbts/shared/contract";

type Included<Entity, Key extends keyof Entity> = { [Property in Key]-?: Exclude<Entity[Property], undefined> };
type StationParts = "operator" | "cells" | "sectors" | "backhaul";

export type StationLocationRecord = Omit<StationLocation, "region"> & Included<StationLocation, "region">;
export type StationRecord = Omit<Station, StationParts | "location"> & Included<Station, StationParts> & { location: StationLocationRecord | null };

export type LocationStationRecord = Omit<LocationStation, StationParts> & Included<LocationStation, StationParts>;
export type LocationRecord = Omit<Location, "region" | "stations"> & Included<Location, "region"> & { stations: LocationStationRecord[] };
export type PhotoRecord = Omit<Photo, "location" | "selections"> & { selections: Omit<PhotoSelection, "station">[] };

export type NrCell = Extract<Cell, { rat: "nr" }>;

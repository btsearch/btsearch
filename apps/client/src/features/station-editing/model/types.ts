import type { BackhaulMedium, CellType, LocationMove, NrMode, StationIdentifierKind, StationStatus } from "@openbts/shared/contract";

import type { StructureDraft } from "@/features/shared/location/types";

export type { OwnerChoice, StructureDraft } from "@/features/shared/location/types";

export type Rat = "gsm" | "umts" | "lte" | "nr";
export type DraftKey = string;
export type EditKind = "editor" | "review" | "form";
export type EditAction = "create" | "update" | "delete";

export type CellNumberField = "lac" | "cid" | "rnc" | "enbid" | "gnbid" | "clid" | "tac" | "pci" | "psc" | "bsic" | "uarfcn" | "earfcn" | "arfcn";
export type CellFlagField = "isEGsm" | "supportsIot" | "supportsRedCap";
export type AreaCodeField = "lac" | "tac";

export type StationField =
  | "siteId"
  | "operatorId"
  | "status"
  | "isConfirmed"
  | "notes"
  | "identifiers"
  | StationIdentifierKind
  | "backhaulMedium"
  | "backhaulSpeedMbps"
  | "backhaulModel";
export type PlaceField = "coordinates" | "regionId" | "city" | "address" | "structureType" | "structureOwner" | "structureNote" | "move";
type SectorField = "degrees";
export type CellField = "bandId" | "sectorKey" | "cellType" | "notes" | "isConfirmed" | "mode" | CellNumberField | CellFlagField;
type PhotoField = "uploads" | "picks" | "mainPhoto";
type GeneralField = "note" | "changes" | "cells";
export type EditField = StationField | PlaceField | SectorField | CellField | PhotoField | GeneralField;

export type BackhaulDraft = {
  medium: BackhaulMedium | null;
  speedMbps: number | null;
  model: string;
};

export type StationDraft = {
  siteId: string;
  operatorId: number | null;
  status: StationStatus;
  isConfirmed: boolean;
  notes: string;
  identifiers: Record<StationIdentifierKind, string>;
  backhaul: BackhaulDraft;
};

export type PlaceDraft = {
  locationId: number | null;
  latitude: number | null;
  longitude: number | null;
  regionId: number | null;
  isRegionPicked: boolean;
  city: string;
  address: string;
  structure: StructureDraft;
  move: LocationMove;
};

export type SectorDraft = {
  key: DraftKey;
  id: number | null;
  degrees: number | null;
};

export type CellDraft = {
  key: DraftKey;
  id: number | null;
  rat: Rat;
  bandId: number | null;
  sectorKey: DraftKey | null;
  cellType: CellType | null;
  notes: string;
  isConfirmed: boolean;
  mode: NrMode | null;
  numbers: Partial<Record<CellNumberField, number | null>>;
  flags: Partial<Record<CellFlagField, boolean>>;
  gnbidLength: number | null;
  isDeleted: boolean;
};

export type AreaCode = { mode: "shared"; value: number | null } | { mode: "perCell" };

export type StationSnapshot = {
  station: StationDraft;
  place: PlaceDraft | null;
  sectors: SectorDraft[];
  cells: CellDraft[];
  areaCodes: Record<Rat, AreaCode>;
};

export type FieldTarget = {
  scope: "station" | "place" | "sector" | "cell" | "areaCode" | "photos" | "general";
  key?: DraftKey;
  rat?: Rat;
  field?: EditField;
};

export type TextValues = Record<string, string | number>;
export type TextPart = { text: string } | { key: string; values?: TextValues };

export type EditError = {
  target: FieldTarget;
  messageKey: string;
  values?: TextValues;
  isQuiet?: boolean;
};

export type EditSession = {
  kind: EditKind;
  action: EditAction;
  countryCode: string | null;
  live: StationSnapshot | null;
  proposed: StationSnapshot | null;
  initial: StationSnapshot;
  draft: StationSnapshot;
  enabledRats: Rat[];
  serverErrors: EditError[];
  isSaveAttempted: boolean;
};

export type RowKind = "same" | "new" | "changed" | "deleted";

export type FieldMark = {
  tone: "database" | "submitted";
  value: TextPart | null;
};

export type FieldState = {
  isChanged: boolean;
  isCorrected: boolean;
  marks: FieldMark[];
};

export type CellRowState = {
  kind: RowKind;
  fields: Partial<Record<CellField, FieldState>>;
};

export type SectorRowState = {
  kind: RowKind;
  field: FieldState;
};

export type ChangeGroup = "station" | "place" | "sectors" | Rat | "photos";

type ChangePair = {
  before: TextPart | null;
  after: TextPart | null;
};

export type ChangeItem = {
  group: ChangeGroup;
  target: FieldTarget;
  kind: "added" | "changed" | "removed";
  label: TextPart[];
  pair: ChangePair | null;
  isCorrection: boolean;
};

export type RatCounters = {
  total: number;
  added: number;
  changed: number;
  deleted: number;
};

export type BuiltBody<Body> = {
  body: Body | null;
  cellKeys: DraftKey[];
  sectorKeys: DraftKey[];
};

export type ProposalOrphan = {
  kind: "cell" | "sector";
  action: "update" | "delete";
  id: number;
};

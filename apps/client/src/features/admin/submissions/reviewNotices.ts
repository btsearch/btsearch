import type { Operator, StationHistoryItem, StructureOwner } from "@openbts/shared/contract";

import type { PlaceStation } from "@/features/station-editing/components/location/placeStations";
import { findPartnerOperator } from "@/features/station-editing/data/partner";
import { hasMarkerMoved, movesStationAlone } from "@/features/station-editing/model/changes";
import type { ChangeItem, EditSession, PlaceField, ProposalOrphan, TextPart } from "@/features/station-editing/model/types";
import { foldText } from "@/lib/foldText";

export type SharedPlaceField = {
  field: (typeof SHARED_PLACE_FIELDS)[number];
  label: TextPart[];
};

export type SharedPlaceEffect = {
  fields: SharedPlaceField[];
  movesWholePlace: boolean;
  stationCount: number;
};

type ProposedOwner = {
  name: string;
  similarOwner: StructureOwner | null;
};

export type ReviewFacts = {
  isStationNewer: boolean;
  newerHistory: StationHistoryItem[];
  sharedPlace: SharedPlaceEffect | null;
  partnerStation: PlaceStation | null;
  proposedOwner: ProposedOwner | null;
  orphanCellCount: number;
  orphanSectorCount: number;
};

type ReviewFactsInput = {
  session: EditSession;
  changes: readonly ChangeItem[];
  orphans: readonly ProposalOrphan[];
  placeStations: readonly PlaceStation[];
  operators: readonly Operator[];
  owners: readonly StructureOwner[];
  history: readonly StationHistoryItem[];
  sentAt: string;
  stationUpdatedAt: string | null;
};

const SHARED_PLACE_FIELDS = [
  "regionId",
  "city",
  "address",
  "structureType",
  "structureOwner",
  "structureNote",
] as const satisfies readonly PlaceField[];
const WORD_BREAK = /[^\p{L}\p{N}]+/u;

function toSharedField(change: ChangeItem): SharedPlaceField[] {
  if (change.group !== "place" || change.pair === null) return [];

  const field = SHARED_PLACE_FIELDS.find((candidate) => candidate === change.target.field);
  return field === undefined ? [] : [{ field, label: change.label }];
}

function findSharedPlaceEffect(session: EditSession, changes: readonly ChangeItem[], stationCount: number): SharedPlaceEffect | null {
  if (stationCount === 0 || session.draft.place === null || movesStationAlone(session)) return null;

  const fields = changes.flatMap(toSharedField);
  const movesWholePlace = hasMarkerMoved(session);
  return fields.length === 0 && !movesWholePlace ? null : { fields, movesWholePlace, stationCount };
}

function findPartnerStation(session: EditSession, operators: readonly Operator[], placeStations: readonly PlaceStation[]): PlaceStation | null {
  if (movesStationAlone(session)) return null;

  const { operatorId } = session.draft.station;
  const operator = operators.find((candidate) => candidate.id === operatorId) ?? null;
  const partner = findPartnerOperator(operator, operators);
  if (partner === null) return null;
  return placeStations.find((station) => station.operatorId === partner.id) ?? null;
}

function listNameWords(name: string): string[] {
  return foldText(name)
    .split(WORD_BREAK)
    .filter((word) => word !== "");
}

function startsWithWords(words: readonly string[], leadingWords: readonly string[]): boolean {
  if (leadingWords.length === 0 || leadingWords.length > words.length) return false;
  return leadingWords.every((word, position) => words[position] === word);
}

function findSimilarOwner(owners: readonly StructureOwner[], name: string): StructureOwner | null {
  const words = listNameWords(name);
  const similarOwner = owners.find((owner) => {
    const ownerWords = listNameWords(owner.name);
    return startsWithWords(words, ownerWords) || startsWithWords(ownerWords, words);
  });
  return similarOwner ?? null;
}

function findProposedOwner(session: EditSession, owners: readonly StructureOwner[]): ProposedOwner | null {
  const owner = session.draft.place?.structure.owner;
  if (owner === undefined || owner.kind !== "proposed") return null;

  const name = owner.name.trim();
  return name === "" ? null : { name, similarOwner: findSimilarOwner(owners, name) };
}

function isLater(moment: string, reference: string): boolean {
  return Date.parse(moment) > Date.parse(reference);
}

export function buildReviewFacts(input: ReviewFactsInput): ReviewFacts {
  const { session, changes, orphans, placeStations, operators, owners, history, sentAt, stationUpdatedAt } = input;
  const changesAzimuths = changes.some((change) => change.group === "sectors");

  return {
    isStationNewer: stationUpdatedAt !== null && isLater(stationUpdatedAt, sentAt),
    newerHistory: history.filter((item) => isLater(item.createdAt, sentAt)),
    sharedPlace: findSharedPlaceEffect(session, changes, placeStations.length),
    partnerStation: changesAzimuths ? findPartnerStation(session, operators, placeStations) : null,
    proposedOwner: findProposedOwner(session, owners),
    orphanCellCount: orphans.filter((orphan) => orphan.kind === "cell").length,
    orphanSectorCount: orphans.filter((orphan) => orphan.kind === "sector").length,
  };
}

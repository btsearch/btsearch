import type { NewCellInput, StationCreate } from "@openbts/shared/contract";

import type { EditReference } from "@/features/station-editing/data/lookups";
import { RAT_FIELDS, RAT_ORDER, toDegrees } from "@/features/station-editing/model/ratFields";
import {
  createCellDraft,
  createEmptyPlace,
  createEmptySnapshot,
  createSectorDraft,
  deriveAreaCodes,
} from "@/features/station-editing/model/snapshots";
import type {
  CellDraft,
  CellFlagField,
  CellNumberField,
  DraftKey,
  PlaceDraft,
  SectorDraft,
  StationSnapshot,
} from "@/features/station-editing/model/types";
import type { PlacePoint } from "@/lib/geo/geocoding";

type SuggestionSource = {
  suggestion: StationCreate | null;
  operatorId: number | null;
  sitePoint: PlacePoint | null;
  pickedPoint: PlacePoint | null;
};

type NumberSource = Partial<Record<CellNumberField, number | null>>;
type FlagSource = Partial<Record<CellFlagField, boolean>>;

function toSuggestedPlace(source: SuggestionSource, reference: EditReference): PlaceDraft | null {
  const location = source.suggestion?.location ?? null;
  const point = source.pickedPoint ?? (location === null ? source.sitePoint : location);
  if (point === null) return null;

  const isSuggestedPoint = source.pickedPoint === null && location !== null;
  const regionId = isSuggestedPoint ? (location.regionId ?? null) : null;
  return {
    ...createEmptyPlace(),
    latitude: point.latitude,
    longitude: point.longitude,
    regionId: regionId !== null && reference.regionsById.has(regionId) ? regionId : null,
    city: isSuggestedPoint ? (location.city ?? "") : "",
    address: isSuggestedPoint ? (location.address ?? "") : "",
  };
}

function toSuggestedCell(cell: NewCellInput, sectorKeys: ReadonlyMap<string, DraftKey>, ownerPlmn: string | null): CellDraft {
  const numberSource: NumberSource = cell;
  const flagSource: FlagSource = cell.rat === "umts" ? {} : cell;
  const numbers: CellDraft["numbers"] = {};
  const flags: CellDraft["flags"] = {};
  for (const { field } of RAT_FIELDS[cell.rat].numbers) numbers[field] = numberSource[field] ?? null;
  for (const { field } of RAT_FIELDS[cell.rat].flags) flags[field] = flagSource[field] ?? false;

  return createCellDraft(cell.rat, {
    bandId: cell.bandId,
    sectorKey: cell.sectorKey === undefined ? null : (sectorKeys.get(cell.sectorKey) ?? null),
    cellType: cell.cellType,
    notes: cell.notes ?? "",
    isConfirmed: true,
    mode: cell.rat === "nr" ? cell.mode : null,
    gnbidLength: cell.rat === "nr" ? (cell.gnbidLength ?? null) : null,
    extraPlmns: (cell.plmns ?? []).filter((code) => code !== ownerPlmn),
    numbers,
    flags,
  });
}

export function toSuggestionSnapshot(source: SuggestionSource, reference: EditReference): StationSnapshot {
  const { suggestion } = source;
  const empty = createEmptySnapshot();
  const operatorId = suggestion?.station.operatorId ?? source.operatorId;
  const operator = operatorId === null ? null : (reference.operatorsById.get(operatorId) ?? null);
  const sectorKeys = new Map<string, DraftKey>();
  const sectors: SectorDraft[] = (suggestion?.sectors ?? []).map((sector) => {
    const draft = createSectorDraft(toDegrees(sector.azimuth));
    sectorKeys.set(sector.key, draft.key);
    return draft;
  });
  const suggestedCells = (suggestion?.cells ?? []).map((cell) => toSuggestedCell(cell, sectorKeys, operator?.primaryPlmn ?? null));
  const cells = RAT_ORDER.flatMap((rat) => suggestedCells.filter((cell) => cell.rat === rat));

  return {
    station: {
      ...empty.station,
      siteId: suggestion?.station.siteId ?? "",
      operatorId: operator?.id ?? null,
      isConfirmed: suggestion?.station.isConfirmed ?? true,
      notes: suggestion?.station.notes ?? "",
    },
    place: toSuggestedPlace(source, reference),
    sectors,
    cells,
    areaCodes: deriveAreaCodes(cells),
  };
}

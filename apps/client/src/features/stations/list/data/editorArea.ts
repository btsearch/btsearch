import type { Me } from "@openbts/shared/contract";

import { REGISTER_COUNTRY_CODE } from "@/features/map/constants";
import type { MapLookups } from "@/features/map/data/mapLookups";
import { useSettledSession } from "@/hooks/useSettledSession";
import { useEditorMe } from "@/lib/auth/me";
import { getCountryName } from "@/lib/geo/countryName";
import { hasFailedLoad } from "@/lib/queryLoadState";

export type EditorArea = {
  coversEverything: boolean;
  regionIdsByCountry: ReadonlyMap<string, ReadonlySet<number> | null>;
};

type EditablePlace = {
  countryCode: string | null;
  regionId: number | null;
};

type EditorAreaState = {
  area: EditorArea | undefined;
  isError: boolean;
  isRetrying: boolean;
  retry: () => void;
};

type AreaHolder = Pick<Me, "role" | "grants">;

type PlacedStation = {
  location?: { countryCode: string; regionId: number } | null;
  operator?: { countryCode: string } | null;
};

export const WHOLE_EDITOR_AREA: EditorArea = { coversEverything: true, regionIdsByCountry: new Map() };
const NO_EDITOR_AREA: EditorArea = { coversEverything: false, regionIdsByCountry: new Map() };

const areasByHolder = new WeakMap<AreaHolder, EditorArea>();

function listGrantedRegionIds(holder: AreaHolder): Map<string, Set<number> | null> {
  const regionIdsByCountry = new Map<string, Set<number> | null>();

  for (const grant of holder.grants) {
    const knownRegionIds = regionIdsByCountry.get(grant.countryCode);
    if (grant.regionIds === null || knownRegionIds === null) regionIdsByCountry.set(grant.countryCode, null);
    else regionIdsByCountry.set(grant.countryCode, new Set([...(knownRegionIds ?? []), ...grant.regionIds]));
  }
  return regionIdsByCountry;
}

export function getEditorArea(holder: AreaHolder): EditorArea {
  if (holder.role === "admin") return WHOLE_EDITOR_AREA;
  if (holder.role !== "editor") return NO_EDITOR_AREA;

  const knownArea = areasByHolder.get(holder);
  if (knownArea !== undefined) return knownArea;

  const area: EditorArea = { coversEverything: false, regionIdsByCountry: listGrantedRegionIds(holder) };
  areasByHolder.set(holder, area);
  return area;
}

export function canEditPlace(area: EditorArea, place: EditablePlace): boolean {
  if (area.coversEverything) return true;
  if (place.countryCode === null) return false;

  const regionIds = area.regionIdsByCountry.get(place.countryCode);
  if (regionIds === undefined) return false;
  return regionIds === null || (place.regionId !== null && regionIds.has(place.regionId));
}

export function isCountryInEditorArea(area: EditorArea, countryCode: string): boolean {
  return area.coversEverything || area.regionIdsByCountry.has(countryCode);
}

export function hasRegionLimits(area: EditorArea): boolean {
  return [...area.regionIdsByCountry.values()].some((regionIds) => regionIds !== null);
}

export function describeArea(area: EditorArea, lookups: MapLookups | undefined, language: string): string {
  const countries = [...area.regionIdsByCountry].map(([countryCode, regionIds]) => {
    const countryName = getCountryName(countryCode, language);
    if (regionIds === null || lookups === undefined) return countryName;

    const regionNames = [...regionIds].flatMap((regionId) => lookups.regionsById.get(regionId)?.name ?? []);
    if (regionNames.length === 0) return countryName;
    return `${countryName} - ${regionNames.sort((left, right) => left.localeCompare(right, language)).join(", ")}`;
  });
  return countries.sort((left, right) => left.localeCompare(right, language)).join("; ");
}

export function getStationEditPlace(station: PlacedStation): EditablePlace {
  return {
    countryCode: station.location?.countryCode ?? station.operator?.countryCode ?? null,
    regionId: station.location?.regionId ?? null,
  };
}

export function getV1RecordEditPlace(regionId: number | null | undefined): EditablePlace {
  return { countryCode: REGISTER_COUNTRY_CODE, regionId: regionId ?? null };
}

export function useEditorArea(isNeeded = true): EditorAreaState {
  const { data: session, isPending: isSessionPending } = useSettledSession();
  const role = session?.user?.role;
  const isEditor = role === "editor";
  const meQuery = useEditorMe(session?.user?.id, isNeeded && isEditor);
  const isError = isNeeded && isEditor && hasFailedLoad(meQuery);

  function retry() {
    void meQuery.refetch();
  }

  let area: EditorArea | undefined;
  if (!isNeeded || role === "admin") area = WHOLE_EDITOR_AREA;
  else if (isSessionPending) area = undefined;
  else if (!isEditor) area = NO_EDITOR_AREA;
  else if (meQuery.data !== undefined) area = getEditorArea(meQuery.data);

  return { area, isError, isRetrying: isError && meQuery.isFetching, retry };
}

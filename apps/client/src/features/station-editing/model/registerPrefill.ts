import type { Band, Operator, Region } from "@openbts/shared/contract";

import { type DraftAction, createSession, draftReducer } from "./draftReducer";
import { RAT_ORDER } from "./ratFields";
import { createCellDraft } from "./snapshots";
import type { CellDraft, EditKind, Rat, StationSnapshot } from "./types";
import { listIdentifierKinds } from "./validate";
import { REGISTER_COUNTRY_CODE } from "@/features/map/constants";
import type { UkeStation } from "@/types/station";

type RegisterPermit = {
  band?: { id: number; rat: string; value: number; variant: string | null } | null;
  source?: "permits" | "device_registry";
  sectors?: readonly unknown[];
};

type PermitBand = {
  id: number;
  rat: Rat;
  value: number;
  variant: string | null;
};

type BandPermit = {
  permit: RegisterPermit;
  band: PermitBand;
};

type RegisterLookups = {
  operatorsById: ReadonlyMap<number, Operator>;
  regionsById: ReadonlyMap<number, Region>;
  bands: readonly Band[];
  countryCode?: string | null;
  bandPlanIds?: ReadonlySet<number> | null;
};

type RegisterPrefillRules = {
  sessionKind: EditKind;
  checksRegion: boolean;
  clearsNotes: boolean;
  clearsSectors: boolean;
};

export const REGISTER_PREFILL_RULES: Record<"editor" | "form", RegisterPrefillRules> = {
  editor: { sessionKind: "editor", checksRegion: true, clearsNotes: false, clearsSectors: false },
  form: { sessionKind: "form", checksRegion: false, clearsNotes: true, clearsSectors: true },
};

const DEVICE_REGISTRY_SOURCE = "device_registry";
const FEWEST_CELLS_PER_BAND = 1;

function isRat(value: string): value is Rat {
  return RAT_ORDER.some((rat) => rat === value);
}

function findPermitBand(permit: RegisterPermit): PermitBand | null {
  const band = permit.band ?? null;
  if (band === null) return null;

  const rat = band.rat.toLowerCase();
  return isRat(rat) ? { ...band, rat } : null;
}

function listBandPermits(permits: readonly RegisterPermit[]): BandPermit[] {
  return permits.flatMap((permit): BandPermit[] => {
    const band = findPermitBand(permit);
    return band === null ? [] : [{ permit, band }];
  });
}

function countRegistrySectors(bandPermits: readonly BandPermit[]): Map<number, number> {
  const sectorCounts = new Map<number, number>();
  for (const { permit, band } of bandPermits) {
    if (permit.source !== DEVICE_REGISTRY_SOURCE || sectorCounts.has(band.id)) continue;
    sectorCounts.set(band.id, permit.sectors?.length ?? 0);
  }
  return sectorCounts;
}

function getFallbackCellCount(sectorCounts: ReadonlyMap<number, number>): number {
  const knownCounts = [...sectorCounts.values()].filter((count) => count > 0);
  return knownCounts.length === 0 ? FEWEST_CELLS_PER_BAND : Math.min(...knownCounts);
}

export function toRegisterCells(
  permits: readonly RegisterPermit[],
  bands: readonly Band[],
  bandPlanIds: ReadonlySet<number> | null = null,
): CellDraft[] {
  const bandPermits = listBandPermits(permits);
  const sectorCounts = countRegistrySectors(bandPermits);
  const fallbackCount = getFallbackCellCount(sectorCounts);
  const seenBandIds = new Set<number>();
  const cells: CellDraft[] = [];

  for (const { band } of bandPermits) {
    if (seenBandIds.has(band.id)) continue;
    seenBandIds.add(band.id);

    const candidates = bands.filter(
      (candidate) =>
        candidate.rat === band.rat &&
        candidate.labelMhz === band.value &&
        candidate.variant === band.variant &&
        (bandPlanIds === null || bandPlanIds.has(candidate.id)),
    );
    if (candidates.length === 0) continue;

    const bandId = candidates.length === 1 ? candidates[0].id : null;
    const cellCount = Math.max(sectorCounts.get(band.id) ?? fallbackCount, FEWEST_CELLS_PER_BAND);
    cells.push(...Array.from({ length: cellCount }, () => createCellDraft(band.rat, { bandId })));
  }
  return RAT_ORDER.flatMap((rat) => cells.filter((cell) => cell.rat === rat));
}

export function listRegisterStationActions(station: UkeStation, lookups: RegisterLookups, rules: RegisterPrefillRules): DraftAction[] {
  const operatorId = station.operator?.id;
  const operator = operatorId === undefined ? null : (lookups.operatorsById.get(operatorId) ?? null);
  const location = station.location ?? null;
  const actions: DraftAction[] = [
    { type: "setStation", patch: rules.clearsNotes ? { siteId: station.station_id, notes: "" } : { siteId: station.station_id } },
    { type: "setOperator", operatorId: operator?.id ?? null, identifierKinds: listIdentifierKinds(operator) },
  ];

  if (location !== null) {
    const registerRegionId = location.region?.id ?? null;
    const isRegionKept = registerRegionId !== null && (!rules.checksRegion || lookups.regionsById.has(registerRegionId));
    actions.push({
      type: "setPlace",
      patch: {
        locationId: null,
        latitude: location.latitude,
        longitude: location.longitude,
        regionId: isRegionKept ? registerRegionId : null,
        isRegionPicked: false,
        city: location.city ?? "",
        address: location.address ?? "",
      },
    });
  }
  if (rules.clearsSectors) actions.push({ type: "applySectors", sectors: [] });
  const bandPlanIds = lookups.countryCode === REGISTER_COUNTRY_CODE ? (lookups.bandPlanIds ?? null) : null;
  actions.push({ type: "applyCells", cells: toRegisterCells(station.permits, lookups.bands, bandPlanIds) }, { type: "setEnabledRats", rats: [] });
  for (const rat of RAT_ORDER) actions.push({ type: "setAreaCode", rat, value: null });
  return actions;
}

export function toRegisterStationDraft(station: UkeStation, lookups: RegisterLookups, rules: RegisterPrefillRules): StationSnapshot {
  const emptySession = createSession({ kind: rules.sessionKind, action: "create", countryCode: null, live: null, proposed: null });
  return listRegisterStationActions(station, lookups, rules).reduce(draftReducer, emptySession).draft;
}

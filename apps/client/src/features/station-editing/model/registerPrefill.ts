import type { Band, OfficialPermitLabel, OfficialSite, OfficialSiteLocation, OfficialSitePermit, Operator, Region } from "@openbts/shared/contract";

import { type DraftAction, createSession, draftReducer } from "./draftReducer";
import { RAT_ORDER } from "./ratFields";
import { createCellDraft } from "./snapshots";
import type { CellDraft, EditKind, Rat, StationSnapshot } from "./types";
import { listIdentifierKinds } from "./validate";
import { toOfficialLabelKey } from "@/features/official/labels";
import { DEVICE_REGISTRY_DATASET } from "@/features/station-details/officialPermits";

type RegisterPermit = Pick<OfficialSitePermit, "label" | "datasets"> & { sectors?: readonly unknown[] };

type RegisterLocation = Pick<OfficialSiteLocation, "countryCode" | "regionId" | "latitude" | "longitude" | "city" | "address">;

type RegisterSite = Pick<OfficialSite, "siteId" | "operatorId"> & {
  location?: RegisterLocation;
  permits?: readonly RegisterPermit[];
};

type PermitBand = {
  key: string;
  rat: Rat;
  labelMhz: number;
  variant: OfficialPermitLabel["variant"];
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

const FEWEST_CELLS_PER_BAND = 1;

function isRat(value: string): value is Rat {
  return RAT_ORDER.some((rat) => rat === value);
}

function findPermitBand({ label }: RegisterPermit): PermitBand | null {
  const { rat, labelMhz, variant } = label;
  if (rat === null || labelMhz === null || !isRat(rat)) return null;
  return { key: toOfficialLabelKey(label), rat, labelMhz, variant };
}

function listBandPermits(permits: readonly RegisterPermit[]): BandPermit[] {
  return permits.flatMap((permit): BandPermit[] => {
    const band = findPermitBand(permit);
    return band === null ? [] : [{ permit, band }];
  });
}

function countRegistrySectors(bandPermits: readonly BandPermit[]): Map<string, number> {
  const sectorCounts = new Map<string, number>();
  for (const { permit, band } of bandPermits) {
    if (!permit.datasets.includes(DEVICE_REGISTRY_DATASET) || sectorCounts.has(band.key)) continue;
    sectorCounts.set(band.key, permit.sectors?.length ?? 0);
  }
  return sectorCounts;
}

function getFallbackCellCount(sectorCounts: ReadonlyMap<string, number>): number {
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
  const seenBandKeys = new Set<string>();
  const cells: CellDraft[] = [];

  for (const { band } of bandPermits) {
    if (seenBandKeys.has(band.key)) continue;
    seenBandKeys.add(band.key);

    const candidates = bands.filter(
      (candidate) =>
        candidate.rat === band.rat &&
        candidate.labelMhz === band.labelMhz &&
        candidate.variant === band.variant &&
        (bandPlanIds === null || bandPlanIds.has(candidate.id)),
    );
    if (candidates.length === 0) continue;

    const bandId = candidates.length === 1 ? candidates[0].id : null;
    const cellCount = Math.max(sectorCounts.get(band.key) ?? fallbackCount, FEWEST_CELLS_PER_BAND);
    cells.push(...Array.from({ length: cellCount }, () => createCellDraft(band.rat, { bandId })));
  }
  return RAT_ORDER.flatMap((rat) => cells.filter((cell) => cell.rat === rat));
}

export function listRegisterStationActions(site: RegisterSite, lookups: RegisterLookups, rules: RegisterPrefillRules): DraftAction[] {
  const operator = site.operatorId === null ? null : (lookups.operatorsById.get(site.operatorId) ?? null);
  const location = site.location ?? null;
  const siteId = site.siteId ?? "";
  const actions: DraftAction[] = [
    { type: "setStation", patch: rules.clearsNotes ? { siteId, notes: "" } : { siteId } },
    {
      type: "setOperator",
      operatorId: operator?.id ?? null,
      ownerPlmn: operator?.primaryPlmn ?? null,
      identifierKinds: listIdentifierKinds(operator, lookups.operatorsById),
    },
  ];

  if (location !== null) {
    const registerRegionId = location.regionId;
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
  const isPlanCountry = location !== null && lookups.countryCode === location.countryCode;
  const bandPlanIds = isPlanCountry ? (lookups.bandPlanIds ?? null) : null;
  actions.push({ type: "applyCells", cells: toRegisterCells(site.permits ?? [], lookups.bands, bandPlanIds) }, { type: "setEnabledRats", rats: [] });
  for (const rat of RAT_ORDER) actions.push({ type: "setAreaCode", rat, value: null });
  return actions;
}

export function toRegisterStationDraft(site: RegisterSite, lookups: RegisterLookups, rules: RegisterPrefillRules): StationSnapshot {
  const emptySession = createSession({ kind: rules.sessionKind, action: "create", countryCode: null, live: null, proposed: null });
  return listRegisterStationActions(site, lookups, rules).reduce(draftReducer, emptySession).draft;
}

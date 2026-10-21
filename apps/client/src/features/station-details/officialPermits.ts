import type { OfficialPermit, OfficialPermitKind, OfficialPermitSite, OfficialRat, OfficialSitePermit } from "@openbts/shared/contract";

import { type OfficialLabelComparator, toOfficialLabelKey, toOfficialRatFilter, toOfficialRatOption } from "@/features/official/labels";

type LabelledPermit = Pick<OfficialSitePermit, "label">;
type SortablePermit = Pick<OfficialSitePermit, "id" | "label" | "number">;
type PlacedPermit = SortablePermit & Pick<OfficialSitePermit, "status" | "sectors">;

type PermitKindLook = {
  code: string;
  labelKey: string;
};

export type AntennaBand = {
  key: string;
  label: OfficialSitePermit["label"];
  isInService: boolean;
};

export type PermitAntenna = {
  heightMeters: number | null;
  bands: AntennaBand[];
};

export type PermitDirection = {
  azimuth: number | null;
  isIndoor: boolean;
  antennas: PermitAntenna[];
};

export const DEVICE_REGISTRY_DATASET = "device-registry";

const NEWEST_RAT_FIRST: readonly OfficialRat[] = ["nr", "lte", "umts", "cdma", "gsm", "iot"];
const UNLABELLED_MHZ = 0;
const PERMIT_KIND_LOOKS: Partial<Record<OfficialPermitKind, PermitKindLook>> = {
  permit: { code: "P", labelKey: "stationDetails:permits.decisionTypeP" },
  permitChange: { code: "zmP", labelKey: "stationDetails:permits.decisionTypeZmP" },
};

function ratPosition(rat: OfficialRat | null): number {
  return rat === null ? NEWEST_RAT_FIRST.length : NEWEST_RAT_FIRST.indexOf(rat);
}

function compareBands(left: LabelledPermit, right: LabelledPermit): number {
  return (
    ratPosition(left.label.rat) - ratPosition(right.label.rat) ||
    (left.label.labelMhz ?? UNLABELLED_MHZ) - (right.label.labelMhz ?? UNLABELLED_MHZ) ||
    Number(left.label.variant === "railway") - Number(right.label.variant === "railway")
  );
}

export function sortPermitsNewestRatFirst<Permit extends SortablePermit>(permits: readonly Permit[]): Permit[] {
  return [...permits].sort(
    (left, right) =>
      compareBands(left, right) || (left.number ?? "").localeCompare(right.number ?? "", undefined, { numeric: true }) || left.id - right.id,
  );
}

export function compareNullsLast(left: number | null, right: number | null): number {
  if (left === null || right === null) return Number(left === null) - Number(right === null);
  return left - right;
}

function addBand(antenna: PermitAntenna, permit: PlacedPermit): void {
  const key = toOfficialLabelKey(permit.label);
  const isInService = permit.status !== "approved";
  const band = antenna.bands.find((candidate) => candidate.key === key);
  if (band === undefined) antenna.bands.push({ key, label: permit.label, isInService });
  else band.isInService ||= isInService;
}

export function listPermitDirections(permits: readonly PlacedPermit[]): PermitDirection[] {
  const directions = new Map<number | null, PermitDirection>();
  for (const permit of sortPermitsNewestRatFirst(permits)) {
    for (const sector of permit.sectors ?? []) {
      const isIndoor = sector.antennaType === "indoor";
      let direction = directions.get(sector.azimuth);
      if (direction === undefined) {
        direction = { azimuth: sector.azimuth, isIndoor, antennas: [] };
        directions.set(sector.azimuth, direction);
      }
      direction.isIndoor &&= isIndoor;
      let antenna = direction.antennas.find((candidate) => candidate.heightMeters === sector.antennaHeightMeters);
      if (antenna === undefined) {
        antenna = { heightMeters: sector.antennaHeightMeters, bands: [] };
        direction.antennas.push(antenna);
      }
      addBand(antenna, permit);
    }
  }

  for (const direction of directions.values()) direction.antennas.sort((left, right) => compareNullsLast(left.heightMeters, right.heightMeters));
  return [...directions.values()].sort((left, right) => compareNullsLast(left.azimuth, right.azimuth));
}

export function listPermitSites(permits: readonly Pick<OfficialPermit, "officialSite">[]): OfficialPermitSite[] {
  const sites = new Map<number, OfficialPermitSite>();
  for (const { officialSite } of permits) if (officialSite !== undefined && !sites.has(officialSite.id)) sites.set(officialSite.id, officialSite);
  return [...sites.values()];
}

export function listPermitBandTags(permits: readonly LabelledPermit[], compareLabels: OfficialLabelComparator): string[] {
  const tags = new Map<string, string>();
  const labels = permits.map(({ label }) => label).sort(compareLabels);
  for (const label of labels) {
    const rat = toOfficialRatFilter(label);
    if (rat !== null && label.labelMhz !== null) tags.set(`${rat}:${label.labelMhz}`, `${toOfficialRatOption(rat).label}${label.labelMhz}`);
  }
  return [...tags.values()];
}

export function getPermitKindLook(kind: OfficialPermitKind | null): PermitKindLook | undefined {
  return kind === null ? undefined : PERMIT_KIND_LOOKS[kind];
}

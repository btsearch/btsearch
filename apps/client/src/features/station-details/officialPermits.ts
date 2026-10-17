import type { OfficialPermit, OfficialPermitKind, OfficialPermitSite, OfficialRat, OfficialSitePermit } from "@openbts/shared/contract";

import { type OfficialLabelComparator, type OfficialRatComparator, toOfficialRatFilter, toOfficialRatOption } from "@/features/official/labels";

type LabelledPermit = Pick<OfficialSitePermit, "label">;

type PermitKindLook = {
  code: string;
  labelKey: string;
};

export const DEVICE_REGISTRY_DATASET = "device-registry";

const OTHER_RAT_GROUP = "OTHER";
const UNLABELLED_MHZ = 0;
const PERMIT_KIND_LOOKS: Partial<Record<OfficialPermitKind, PermitKindLook>> = {
  permit: { code: "P", labelKey: "stationDetails:permits.decisionTypeP" },
  permitChange: { code: "zmP", labelKey: "stationDetails:permits.decisionTypeZmP" },
};

function toRatGroupName(rat: OfficialRat | null): string {
  return rat === null ? OTHER_RAT_GROUP : rat.toUpperCase();
}

function compareLabelMhz(left: LabelledPermit, right: LabelledPermit): number {
  return (left.label.labelMhz ?? UNLABELLED_MHZ) - (right.label.labelMhz ?? UNLABELLED_MHZ);
}

export function groupPermitsByRat<Permit extends LabelledPermit>(
  permits: readonly Permit[],
  compareRats: OfficialRatComparator,
): Map<string, Permit[]> {
  const groups = new Map<OfficialRat | null, Permit[]>();
  for (const permit of permits) {
    const group = groups.get(permit.label.rat);
    if (group === undefined) groups.set(permit.label.rat, [permit]);
    else group.push(permit);
  }

  const rats = [...groups.keys()].sort((left, right) => Number(left === null) - Number(right === null) || compareRats(left, right));
  return new Map(rats.map((rat) => [toRatGroupName(rat), [...(groups.get(rat) ?? [])].sort(compareLabelMhz)]));
}

export function listPermitSites(permits: readonly Pick<OfficialPermit, "officialSite">[]): OfficialPermitSite[] {
  const sites = new Map<number, OfficialPermitSite>();
  for (const { officialSite } of permits) if (officialSite !== undefined && !sites.has(officialSite.id)) sites.set(officialSite.id, officialSite);
  return [...sites.values()];
}

export function hasDeviceRegistryListing(permits: readonly Pick<OfficialSitePermit, "datasets">[]): boolean {
  return permits.some((permit) => permit.datasets.includes(DEVICE_REGISTRY_DATASET));
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

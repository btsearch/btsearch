import type { Brand, Operator, StructureOwner } from "@openbts/shared/contract";

import type { OwnerCreation, OwnerPickerProps } from "./ownerPicker";
import type { OwnerChoice } from "./types";
import { type EditorArea, isCountryInEditorArea } from "@/features/stations/list/data/editorArea";

export type StructureOwnerOptions = Pick<
  OwnerPickerProps,
  "owners" | "selectedOwner" | "brands" | "operators" | "creation" | "countryCode" | "isAdmin" | "submittedName"
>;

type StructureOwnerOptionsInput = {
  owners: readonly StructureOwner[];
  brands: readonly Brand[];
  operators: readonly Operator[];
  value: OwnerChoice;
  countryCode: string | null;
  area: EditorArea | undefined;
  proposesOwner?: boolean;
  allowsOwnerProposals?: boolean;
  submittedName?: string | null;
};

function getOwnerCreation(
  proposesOwner: boolean,
  allowsOwnerProposals: boolean,
  area: EditorArea | undefined,
  countryCode: string | null,
): OwnerCreation {
  if (proposesOwner) return allowsOwnerProposals ? "propose" : "none";
  if (area === undefined) return "none";
  if (area.coversEverything) return "create";
  return countryCode !== null && isCountryInEditorArea(area, countryCode) ? "create" : "none";
}

export function getCountryStructureOwners(owners: readonly StructureOwner[], countryCode: string | null): StructureOwner[] {
  return owners.filter((owner) => owner.countryCode === null || owner.countryCode === countryCode);
}

export function buildStructureOwnerOptions({
  owners,
  brands,
  operators,
  value,
  countryCode,
  area,
  proposesOwner = false,
  allowsOwnerProposals = true,
  submittedName = null,
}: StructureOwnerOptionsInput): StructureOwnerOptions {
  return {
    owners: getCountryStructureOwners(owners, countryCode),
    selectedOwner: value.kind === "listed" ? (owners.find((owner) => owner.id === value.ownerId) ?? null) : null,
    brands,
    operators,
    creation: getOwnerCreation(proposesOwner, allowsOwnerProposals, area, countryCode),
    countryCode,
    isAdmin: !proposesOwner && area?.coversEverything === true,
    submittedName,
  };
}

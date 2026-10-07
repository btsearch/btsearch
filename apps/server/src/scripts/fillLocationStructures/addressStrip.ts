import type { StructureValues } from "../../features/locations/structure.js";
import type { LocationRow } from "../../features/locations/write.js";
import { type ParsedAddress, addressWithoutDescription, namesStreetOrNumber, parseAddress, withoutFormerRemarks } from "./address.js";
import type { PlannedStructure } from "./plan.js";

export const KEPT_ADDRESS_REASONS = {
  no_description: "no description in the address",
  unrecognised: "a description without a recognised type, owner or separable note-only suffix",
  only_place_known: "a description that is the whole address and holds a street or a number",
  type_not_stored: "a type in the description that is not on the location",
  owner_not_stored: "an owner in the description that is not on the location",
  note_not_stored: "more in the description than the location's note holds",
};

export type KeptAddressReason = keyof typeof KEPT_ADDRESS_REASONS;
export type StructureState = { hasType: boolean; hasOwner: boolean; note: string | null };
export type AddressStrip = Pick<LocationRow, "id" | "address"> & { addressAfter: string | null; keptBecause: KeptAddressReason | null };

export function storedStructure(location: StructureValues, namedType: PlannedStructure["type"], namedOwnerId: number | null): StructureState {
  return {
    hasType: namedType !== null && location.structure_type === namedType,
    hasOwner: namedOwnerId !== null && location.structure_owner_id === namedOwnerId,
    note: location.structure_note,
  };
}

export function plannedStructure(plan: PlannedStructure, named: Pick<PlannedStructure, "type" | "owner"> = plan): StructureState {
  return {
    hasType: named.type !== null && plan.type === named.type,
    hasOwner: named.owner !== null && plan.owner === named.owner,
    note: plan.note,
  };
}

function reasonToKeep(parsed: ParsedAddress, structure: StructureState): KeptAddressReason | null {
  const { street, description, type, owner, note } = parsed;
  const hasStreet = street !== null && street !== "";

  if (description === null) return "no_description";
  if (type === null && owner === null && (!hasStreet || note === null)) return "unrecognised";
  if (!hasStreet && note !== null && namesStreetOrNumber(withoutFormerRemarks(description))) return "only_place_known";
  if (type !== null && !structure.hasType) return "type_not_stored";
  if (owner !== null && !structure.hasOwner) return "owner_not_stored";
  if (note !== null && structure.note !== note && structure.note !== description) return "note_not_stored";
  return null;
}

export function planAddressStrip(location: Pick<LocationRow, "id" | "address">, structure: StructureState): AddressStrip {
  const parsed = parseAddress(location.address);
  const keptBecause = reasonToKeep(parsed, structure);
  const addressAfter = keptBecause === null ? addressWithoutDescription(parsed) : location.address;

  return { id: location.id, address: location.address, addressAfter, keptBecause };
}

export function rewritesAddress(strip: AddressStrip): boolean {
  return strip.keptBecause === null;
}

export function planFullStrip(location: Pick<LocationRow, "id" | "address">, structureOf: (address: string | null) => StructureState): AddressStrip {
  const strip = planAddressStrip(location, structureOf(location.address));
  if (!rewritesAddress(strip)) return strip;

  const rest = planFullStrip({ id: location.id, address: strip.addressAfter }, structureOf);
  return { ...strip, addressAfter: rest.addressAfter };
}

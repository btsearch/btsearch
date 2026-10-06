import type { StoredStructureType } from "../../features/structures/serialize.js";
import { type NamedOwner, type ParsedOwner, cutAtWordBoundary, parseAddress } from "./address.js";
import { type LocationOperator, type OwnTowerRule, resolveOwnTower } from "./ownTower.js";

export type PlannedStructure = {
  id: number;
  address: string | null;
  description: string | null;
  type: StoredStructureType | null;
  owner: NamedOwner | null;
  ownTowerRule: OwnTowerRule | null;
  note: string | null;
  isNoteCut: boolean;
};

function resolveOwner(
  parsedOwner: ParsedOwner | null,
  operators: readonly LocationOperator[],
  aYearAgo: Date,
): Pick<PlannedStructure, "owner" | "ownTowerRule"> {
  if (parsedOwner !== "station_operator") return { owner: parsedOwner, ownTowerRule: null };

  const { owner, rule } = resolveOwnTower(operators, aYearAgo);
  return { owner, ownTowerRule: rule };
}

export function fillsSomething(plan: PlannedStructure): boolean {
  return plan.type !== null || plan.owner !== null || plan.note !== null;
}

export function planStructure(
  location: Pick<PlannedStructure, "id" | "address">,
  operators: readonly LocationOperator[],
  aYearAgo: Date,
  noteMaxLength: number,
): PlannedStructure {
  const { description, type, owner: parsedOwner, note: fullNote } = parseAddress(location.address);
  const { owner, ownTowerRule } = resolveOwner(parsedOwner, operators, aYearAgo);
  const note = fullNote === null ? null : cutAtWordBoundary(fullNote, noteMaxLength);

  return { id: location.id, address: location.address, description, type, owner, ownTowerRule, note, isNoteCut: note !== fullNote };
}

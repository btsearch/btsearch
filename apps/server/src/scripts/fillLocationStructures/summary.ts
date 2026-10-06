import type { NamedOwner } from "./address.js";
import { type AddressStrip, KEPT_ADDRESS_REASONS, rewritesAddress } from "./addressStrip.js";
import { OWN_TOWER_RULES } from "./ownTower.js";
import { type PlannedStructure, fillsSomething } from "./plan.js";
import type { OwnerEntry } from "./structureOwners.js";

type OwnerEntries = ReadonlyMap<NamedOwner, OwnerEntry>;

const UNTYPED_DESCRIPTIONS_SHOWN = 60;
const REWRITTEN_ADDRESSES_SHOWN = 40;
const EMPTY_ADDRESS = "(empty)";
const REPORT_COLUMNS = ["id", "address", "type", "owner", "note", "address after"];

function tally<Key>(keys: readonly Key[]): [Key, number][] {
  const counts = new Map<Key, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].sort(([, left], [, right]) => right - left);
}

function printCounts(title: string, counts: readonly (readonly [string, number])[]): void {
  console.log(`\n${title}`);
  for (const [label, count] of counts) console.log(`${String(count).padStart(7)}  ${label}`);
}

function ownerName(entries: OwnerEntries, owner: NamedOwner | null): string {
  if (owner === null) return "";
  return entries.get(owner)?.name ?? owner;
}

function reportLine(cells: readonly (string | number | null)[]): string {
  return cells.map((cell) => String(cell ?? "").replace(/[\t\r\n]+/g, " ")).join("\t");
}

export function printSummary(plans: readonly PlannedStructure[], entries: OwnerEntries): void {
  const types = plans.flatMap((plan) => plan.type ?? []);
  const owners = plans.flatMap((plan) => plan.owner ?? []);
  const ownTowerRules = plans.flatMap((plan) => plan.ownTowerRule ?? []);
  const noted = plans.filter((plan) => plan.note !== null).length;
  const untouched = plans.filter((plan) => !fillsSomething(plan)).length;
  const missingOwners = [...entries.values()].flatMap((entry) => (entry.id === null ? [entry] : []));
  const untyped = plans.flatMap((plan) => (plan.type === null && plan.description !== null ? [plan.description.toLowerCase()] : []));
  const untypedSpellings = tally(untyped);

  console.log(`of those ${plans.length}: ${types.length} get a type, ${owners.length} an owner, ${noted} a note, ${untouched} nothing`);
  printCounts("locations per type", tally(types));
  printCounts("locations per owner", tally(owners.map((owner) => ownerName(entries, owner))));

  console.log(`\nowner entries to create: ${missingOwners.length}`);
  for (const entry of missingOwners) console.log(`  ${entry.name}: ${entry.linkRemark}`);

  printCounts("own-tower descriptions by rule", tally(ownTowerRules.map((rule) => OWN_TOWER_RULES[rule])));
  printCounts(
    `descriptions without a type: ${untyped.length} locations, ${untypedSpellings.length} spellings; the ${UNTYPED_DESCRIPTIONS_SHOWN} most common`,
    untypedSpellings.slice(0, UNTYPED_DESCRIPTIONS_SHOWN),
  );

  for (const plan of plans) {
    if (plan.isNoteCut) console.log(`warning: the note of location ${plan.id} was too long and was cut to: ${plan.note}`);
  }
}

function spreadOver<Item>(items: readonly Item[], count: number): Item[] {
  const step = Math.max(1, Math.floor(items.length / count));
  return items.filter((_item, index) => index % step === 0).slice(0, count);
}

export function printAddressSummary(strips: readonly AddressStrip[]): void {
  const rewritten = strips.filter(rewritesAddress);
  const emptied = rewritten.filter((strip) => strip.addressAfter === null);
  const stillSaySomething = rewritten.filter((strip) => strip.addressAfter !== null);
  const keptReasons = strips.flatMap((strip) => strip.keptBecause ?? []);

  console.log(
    `\naddresses: ${rewritten.length} lose their description, ${keptReasons.length} stay as they are; ` +
      `${emptied.length} of the rewritten ones were only a description and end up empty`,
  );
  printCounts("addresses that stay as they are", tally(keptReasons.map((reason) => KEPT_ADDRESS_REASONS[reason])));

  console.log(`\n${Math.min(REWRITTEN_ADDRESSES_SHOWN, stillSaySomething.length)} of the rewritten addresses, spread over all of them`);
  for (const strip of spreadOver(stillSaySomething, REWRITTEN_ADDRESSES_SHOWN)) console.log(`  ${strip.address}\n    -> ${strip.addressAfter}`);
}

function addressAfterCell(strip: AddressStrip | undefined): string | null {
  if (strip === undefined) return null;
  return strip.addressAfter ?? EMPTY_ADDRESS;
}

export function reportText(plans: readonly PlannedStructure[], entries: OwnerEntries, strips: readonly AddressStrip[]): string {
  const rewrittenById = new Map(strips.filter(rewritesAddress).map((strip) => [strip.id, strip]));
  const plannedIds = new Set(plans.map((plan) => plan.id));

  const plannedLines = plans.map((plan) =>
    reportLine([plan.id, plan.address, plan.type, ownerName(entries, plan.owner), plan.note, addressAfterCell(rewrittenById.get(plan.id))]),
  );
  const rewrittenOnlyLines = [...rewrittenById.values()]
    .filter((strip) => !plannedIds.has(strip.id))
    .map((strip) => reportLine([strip.id, strip.address, null, null, null, addressAfterCell(strip)]));

  return `${[reportLine(REPORT_COLUMNS), ...plannedLines, ...rewrittenOnlyLines].join("\n")}\n`;
}

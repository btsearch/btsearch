import "dotenv/config";
import { sql as connection } from "@openbts/drizzle/db";
import { STRUCTURE_NOTE_MAX_LENGTH } from "@openbts/shared/contract";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { StructureValues } from "../../features/locations/structure.js";
import { unique } from "../../lib/collections.js";
import type { NamedOwner } from "./address.js";
import { planFullStrip, plannedStructure, rewritesAddress, storedStructure } from "./addressStrip.js";
import { type LocationFill, fillLocations, isUnfilled, loadLocations, loadOperatorsByLocation, stripAddresses } from "./locations.js";
import { type PlannedStructure, fillsSomething, planStructure } from "./plan.js";
import { COUNTRY_CODE, createMissingOwners, findStoredOwnerId, loadOwnerDirectory, resolveOwnerEntries } from "./structureOwners.js";
import { printAddressSummary, printSummary, reportText } from "./summary.js";

const BATCH_SIZE = 500;

const { values: options } = parseArgs({
  options: { apply: { type: "boolean" }, report: { type: "string" }, "strip-addresses": { type: "boolean" } },
});
const APPLY = options.apply === true;
const STRIP_ADDRESSES = options["strip-addresses"] === true;
const REPORT_FILE = options.report;

function toFill(plan: PlannedStructure, ownerIds: ReadonlyMap<NamedOwner, number>): LocationFill {
  const ownerId = plan.owner === null ? null : ownerIds.get(plan.owner);
  if (ownerId === undefined) throw new Error(`The owner of location ${plan.id} has no entry`);

  return { id: plan.id, address: plan.address, values: { structure_type: plan.type, structure_owner_id: ownerId, structure_note: plan.note } };
}

async function writeInBatches<Item>(items: readonly Item[], write: (batch: readonly Item[]) => Promise<number>, done: string): Promise<number> {
  let written = 0;
  /* eslint-disable no-await-in-loop */
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    written += await write(items.slice(start, start + BATCH_SIZE));
    console.log(`${done} ${written}`);
  }
  /* eslint-enable no-await-in-loop */
  return written;
}

async function main(): Promise<void> {
  const aYearAgo = new Date();
  aYearAgo.setFullYear(aYearAgo.getFullYear() - 1);

  const [locations, operatorsByLocation, directory] = await Promise.all([
    loadLocations(COUNTRY_CODE),
    loadOperatorsByLocation(),
    loadOwnerDirectory(),
  ]);
  const plans = locations
    .filter(isUnfilled)
    .map((location) => planStructure(location, operatorsByLocation.get(location.id) ?? [], aYearAgo, STRUCTURE_NOTE_MAX_LENGTH));
  const ownerEntries = resolveOwnerEntries(unique(plans.map((plan) => plan.owner)), directory);
  const fillable = plans.filter(fillsSomething);
  const fillableById = new Map(fillable.map((plan) => [plan.id, plan]));
  const strips = STRIP_ADDRESSES
    ? locations.map((location) => {
        const plan = fillableById.get(location.id);
        const operators = operatorsByLocation.get(location.id) ?? [];
        return planFullStrip(location, (address) => {
          const named = planStructure({ id: location.id, address }, operators, aYearAgo, STRUCTURE_NOTE_MAX_LENGTH);
          if (plan !== undefined) return plannedStructure(plan, named);

          return storedStructure(location, named.type, named.owner === null ? null : findStoredOwnerId(named.owner, directory));
        });
      })
    : [];
  const rewrites = strips.filter(rewritesAddress);

  console.log(APPLY ? "applying" : "dry run, pass --apply to write");
  console.log(`read ${locations.length} locations in ${COUNTRY_CODE}; ${plans.length} have no type, owner or note yet, the others are left alone`);
  printSummary(plans, ownerEntries);
  if (STRIP_ADDRESSES) printAddressSummary(strips);

  if (REPORT_FILE !== undefined) {
    await writeFile(resolve(REPORT_FILE), reportText(plans, ownerEntries, strips));
    console.log(`\nwrote the locations this run looks at to ${resolve(REPORT_FILE)}`);
  }
  if (!APPLY) {
    const addressPhrase = STRIP_ADDRESSES ? ` and rewrite ${rewrites.length} addresses` : "";
    console.log(`\nthe database was not changed; run again with --apply to fill ${fillable.length} locations${addressPhrase}`);
    return;
  }

  const ownerIds = await createMissingOwners(ownerEntries);
  const fills = fillable.map((plan) => toFill(plan, ownerIds));
  console.log(`\nthe owner entries are in place; filling ${fills.length} locations`);

  const filled = await writeInBatches(fills, fillLocations, "locations filled:");
  if (filled < fills.length) console.log(`${fills.length - filled} locations changed while the script ran and were left alone`);
  if (!STRIP_ADDRESSES) return;

  const structuresById = new Map<number, StructureValues>(locations.map((location) => [location.id, location]));
  for (const fill of fills) structuresById.set(fill.id, fill.values);

  console.log(`\nrewriting ${rewrites.length} addresses`);
  const rewritten = await writeInBatches(rewrites, (batch) => stripAddresses(batch, structuresById), "addresses rewritten:");
  if (rewritten < rewrites.length) console.log(`${rewrites.length - rewritten} addresses were left alone: the location changed or was not filled`);
}

main()
  .catch((error: unknown) => {
    console.error("fill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });

import {
  bands,
  brands,
  cells,
  countries,
  countryBands,
  locations,
  operatorLinks,
  operators,
  plmns,
  proposedCells,
  proposedLocations,
  proposedStations,
  regions,
  roleGrantRegions,
  stations,
  statsSnapshots,
  ukeLocations,
  ukePermits,
  ukeStations,
} from "@openbts/drizzle";
import { operatorLinkSchema, plmnSchema } from "@openbts/shared/contract";
import type { OperatorLink, Plmn } from "@openbts/shared/contract";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import type { Database } from "../../../../database/psql.js";
import type { DbTx } from "../../../../types/global.js";
import { countryBandDeleteEntries } from "../../../bands/remove.js";
import type { CountryBandRow } from "../../../bands/serialize.js";
import { loadOperatorDetails } from "../../../operators/details.js";
import { toOperator } from "../../../operators/serialize.js";
import { replaceLinks, replacePlmns } from "../../../operators/write.js";
import type { AuditEntry, AuditEntryInput } from "../../types.js";
import { type SnapshotRecord, isSnapshotRecord, recordIdNumber, requireSnapshot, snapshotToRow } from "../columns.js";
import { changedFields, staleFields, valuesEqual } from "../compare.js";
import { type ApplyState, type PlannedEntry, type RevertDependent, type StrategyContext, conflictFor } from "../types.js";
import { createEmptyPlan, inverseMetadata, numberField, pendingInsertProvider, snapshotFieldNames, stringField } from "./common.js";

type OperationCountryBand = { entry: AuditEntry; countryCode: string; row: SnapshotRecord };

const bandSelectSchema = createSelectSchema(bands);
const bandInsertSchema = createInsertSchema(bands);
const countryBandInsertSchema = createInsertSchema(countryBands);
const operatorInsertSchema = createInsertSchema(operators);
const regionInsertSchema = createInsertSchema(regions);
const removedOperatorDetailsSchema = z.object({ plmns: z.array(plmnSchema).default([]), links: z.array(operatorLinkSchema).default([]) });
const changedOperatorDetailsSchema = z.object({
  plmns: z.object({ old: z.array(plmnSchema), new: z.array(plmnSchema) }).optional(),
  links: z.object({ old: z.array(operatorLinkSchema), new: z.array(operatorLinkSchema) }).optional(),
});

function positiveDependents(rows: RevertDependent[]): RevertDependent[] {
  return rows.filter((row) => row.count > 0);
}

function selectedReferenceRemoval(
  context: StrategyContext,
  entity: AuditEntry["entity"],
  recordId: number,
  field: string,
  referencedId: number,
  createDeletes: boolean,
): number | undefined {
  const entry = context.selectedEntries.find((candidate) => candidate.entity === entity && Number(candidate.record_id) === recordId);
  if (entry === undefined) return undefined;
  if (entry.op === "create") return createDeletes ? entry.id : undefined;
  if (
    entry.op !== "update" ||
    !isSnapshotRecord(entry.old_values) ||
    !isSnapshotRecord(entry.new_values) ||
    !(field in entry.old_values) ||
    !(field in entry.new_values)
  )
    return undefined;
  const oldId = numberField(entry.old_values, field);
  const newId = numberField(entry.new_values, field);
  return oldId !== newId && oldId !== referencedId ? entry.id : undefined;
}

function addReferenceRemovalDependency(plan: PlannedEntry, prerequisiteEntryId: number, table: string, message: string): void {
  plan.dependencies.push({
    prerequisiteEntryId,
    failure: {
      kind: "referenced",
      message,
      forceResolution: "skip",
      dependents: [{ table, count: 1 }],
    },
  });
}

async function markOperatorStations(tx: DbTx, state: ApplyState, operatorId: number): Promise<void> {
  const rows = await tx.select({ id: stations.id }).from(stations).where(eq(stations.operator_id, operatorId));
  for (const row of rows) state.affectedStationIds.add(row.id);
}

async function markBandStations(tx: DbTx, state: ApplyState, bandId: number): Promise<void> {
  const rows = await tx.selectDistinct({ stationId: cells.station_id }).from(cells).where(eq(cells.band_id, bandId));
  for (const row of rows) state.affectedStationIds.add(row.stationId);
}

async function markRegionStations(tx: DbTx, state: ApplyState, regionId: number): Promise<void> {
  const rows = await tx
    .selectDistinct({ stationId: stations.id })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(eq(locations.region_id, regionId));
  for (const row of rows) state.affectedStationIds.add(row.stationId);
}

async function operatorDependents(context: StrategyContext, plan: PlannedEntry, id: number): Promise<RevertDependent[]> {
  const [stationRows, ukeRows, childRows, proposedRows, snapshotRows, memberRows] = await Promise.all([
    context.tx.select({ id: stations.id }).from(stations).where(eq(stations.operator_id, id)),
    context.tx.select({ value: count() }).from(ukeStations).where(eq(ukeStations.operator_id, id)),
    context.tx.select({ id: operators.id }).from(operators).where(eq(operators.parent_id, id)),
    context.tx.select({ value: count() }).from(proposedStations).where(eq(proposedStations.operator_id, id)),
    context.tx.select({ value: count() }).from(statsSnapshots).where(eq(statsSnapshots.operator_id, id)),
    context.tx.select({ value: count() }).from(operatorLinks).where(eq(operatorLinks.relatedOperatorId, id)),
  ]);
  const stationaryStations = stationRows.filter((station) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "stations", station.id, "operator_id", id, false);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "stations", "The operator remains assigned to a station whose revert cannot move it");
    return false;
  });
  const retainedChildren = childRows.filter((child) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "operators", child.id, "parent_id", id, true);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "operators", "The operator remains a parent of an operator whose revert cannot move it");
    return false;
  });
  return positiveDependents([
    { table: "stations", count: stationaryStations.length },
    { table: "uke.uke_stations", count: ukeRows[0]?.value ?? 0 },
    { table: "operators", count: retainedChildren.length },
    { table: "submissions.proposed_stations", count: proposedRows[0]?.value ?? 0 },
    { table: "statistics.stats_snapshots", count: snapshotRows[0]?.value ?? 0 },
    { table: "operator_links", count: memberRows[0]?.value ?? 0 },
  ]);
}

async function bandDependents(context: StrategyContext, plan: PlannedEntry, id: number): Promise<RevertDependent[]> {
  const [cellRows, permitRows, proposedRows, snapshotRows] = await Promise.all([
    context.tx.select({ id: cells.id }).from(cells).where(eq(cells.band_id, id)),
    context.tx.select({ value: count() }).from(ukePermits).where(eq(ukePermits.band_id, id)),
    context.tx.select({ value: count() }).from(proposedCells).where(eq(proposedCells.band_id, id)),
    context.tx.select({ value: count() }).from(statsSnapshots).where(eq(statsSnapshots.band_id, id)),
  ]);
  const retainedCells = cellRows.filter((cell) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "cells", cell.id, "band_id", id, true);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "cells", "The band remains assigned to a cell whose revert cannot move it");
    return false;
  });
  return positiveDependents([
    { table: "cells", count: retainedCells.length },
    { table: "uke.uke_permits", count: permitRows[0]?.value ?? 0 },
    { table: "submissions.proposed_cells", count: proposedRows[0]?.value ?? 0 },
    { table: "statistics.stats_snapshots", count: snapshotRows[0]?.value ?? 0 },
  ]);
}

async function regionDependents(context: StrategyContext, plan: PlannedEntry, id: number): Promise<RevertDependent[]> {
  const [locationRows, ukeRows, proposedRows, grantRows] = await Promise.all([
    context.tx.select({ id: locations.id }).from(locations).where(eq(locations.region_id, id)),
    context.tx.select({ value: count() }).from(ukeLocations).where(eq(ukeLocations.region_id, id)),
    context.tx.select({ value: count() }).from(proposedLocations).where(eq(proposedLocations.region_id, id)),
    context.tx.select({ value: count() }).from(roleGrantRegions).where(eq(roleGrantRegions.regionId, id)),
  ]);
  const retainedLocations = locationRows.filter((location) => {
    const prerequisiteEntryId = selectedReferenceRemoval(context, "locations", location.id, "region_id", id, true);
    if (prerequisiteEntryId === undefined) return true;
    addReferenceRemovalDependency(plan, prerequisiteEntryId, "locations", "The region remains assigned to a location whose revert cannot move it");
    return false;
  });
  return positiveDependents([
    { table: "locations", count: retainedLocations.length },
    { table: "uke.uke_locations", count: ukeRows[0]?.value ?? 0 },
    { table: "submissions.proposed_locations", count: proposedRows[0]?.value ?? 0 },
    { table: "auth.role_grant_regions", count: grantRows[0]?.value ?? 0 },
  ]);
}

async function addOperatorUniqueConflicts(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const name = stringField(target, "name");
  if (name !== null) {
    const countryCode = stringField(target, "countryCode") ?? LEGACY_COUNTRY_CODE;
    const [duplicate] = await context.tx
      .select({ id: operators.id })
      .from(operators)
      .where(and(eq(operators.name, name), eq(operators.countryCode, countryCode), ne(operators.id, id)))
      .limit(1);
    if (duplicate !== undefined)
      plan.conflicts.push(
        conflictFor(plan.entry, "unique_violation", "The original operator name is already in use", "skip", {
          constraint: "operators_country_name_unique",
        }),
      );
  }
  const mnc = numberField(target, "mnc");
  if (mnc !== null) {
    const [[duplicate], [takenCode]] = await Promise.all([
      context.tx
        .select({ id: operators.id })
        .from(operators)
        .where(and(eq(operators.mnc, mnc), ne(operators.id, id)))
        .limit(1),
      context.tx
        .select({ id: plmns.id })
        .from(plmns)
        .where(and(eq(plmns.code, String(mnc)), ne(plmns.operatorId, id)))
        .limit(1),
    ]);
    if (duplicate !== undefined || takenCode !== undefined) {
      const constraint = duplicate !== undefined ? "operators_mnc_unique" : "plmns_code_unique";
      plan.conflicts.push(conflictFor(plan.entry, "unique_violation", "The original operator MNC is already in use", "skip", { constraint }));
    }
  }
}

async function addOperatorParentConflict(
  context: StrategyContext,
  plan: PlannedEntry,
  target: SnapshotRecord,
  fields: ReadonlySet<string>,
): Promise<number | undefined> {
  if (!fields.has("parent_id")) return undefined;
  const parentId = numberField(target, "parent_id");
  if (parentId === null) return undefined;
  const prerequisiteEntryId = pendingInsertProvider(context, "operators", parentId);
  if (prerequisiteEntryId !== undefined) {
    plan.dependencies.push({
      prerequisiteEntryId,
      failure: {
        kind: "fk_missing",
        message: "The original parent operator cannot be restored",
        forceResolution: "drop_field",
        nullableField: "parent_id",
        constraint: "operators_parent_id_operators_id_fk",
      },
    });
    return prerequisiteEntryId;
  }
  const [parent] = await context.tx.select({ id: operators.id }).from(operators).where(eq(operators.id, parentId)).limit(1);
  if (parent !== undefined) return undefined;
  plan.conflicts.push(
    conflictFor(plan.entry, "fk_missing", "The original parent operator no longer exists", "drop_field", {
      constraint: "operators_parent_id_operators_id_fk",
      nullableField: "parent_id",
    }),
  );
  return undefined;
}

async function addOperatorBrandConflict(
  context: StrategyContext,
  plan: PlannedEntry,
  target: SnapshotRecord,
  fields: ReadonlySet<string>,
): Promise<void> {
  if (!fields.has("brandId")) return;
  const brandId = numberField(target, "brandId");
  if (brandId === null) return;
  const [brand] = await context.tx.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand !== undefined) return;
  plan.conflicts.push(
    conflictFor(plan.entry, "fk_missing", "The original brand no longer exists", "drop_field", {
      constraint: "operators_brand_id_brands_id_fk",
      nullableField: "brandId",
    }),
  );
}

function removedOperatorDetails(entry: AuditEntry): z.infer<typeof removedOperatorDetailsSchema> {
  const details = removedOperatorDetailsSchema.safeParse(entry.metadata ?? {});
  return details.success ? details.data : { plmns: [], links: [] };
}

function changedOperatorDetails(entry: AuditEntry): z.infer<typeof changedOperatorDetailsSchema> {
  const details = changedOperatorDetailsSchema.safeParse(entry.metadata ?? {});
  if (!details.success) return {};

  const { plmns: plmnChange, links: linkChange } = details.data;
  const changed: z.infer<typeof changedOperatorDetailsSchema> = {};
  if (plmnChange !== undefined && !valuesEqual(plmnChange.old, plmnChange.new)) changed.plmns = plmnChange;
  if (linkChange !== undefined && !valuesEqual(linkChange.old, linkChange.new)) changed.links = linkChange;
  return changed;
}

export function hasOperatorDetailChange(entry: AuditEntry): boolean {
  if (entry.entity !== "operators") return false;

  const changed = changedOperatorDetails(entry);
  return changed.plmns !== undefined || changed.links !== undefined;
}

async function addOperatorCodeConflicts(context: StrategyContext, plan: PlannedEntry, id: number, targetPlmns: readonly Plmn[]): Promise<void> {
  if (targetPlmns.length === 0) return;

  const codes = targetPlmns.map((plmn) => plmn.plmn);
  const [codeRows, legacyRows] = await Promise.all([
    context.tx
      .select({ code: plmns.code })
      .from(plmns)
      .where(and(inArray(plmns.code, codes), ne(plmns.operatorId, id))),
    context.tx
      .select({ mnc: operators.mnc })
      .from(operators)
      .where(and(inArray(operators.mnc, codes.map(Number)), ne(operators.id, id))),
  ]);
  const takenCodes = new Set([...codeRows.map((row) => row.code), ...legacyRows.map((row) => String(row.mnc))]);
  for (const code of codes) {
    if (!takenCodes.has(code)) continue;
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", `The original network code ${code} is already in use`, "skip", {
        constraint: "plmns_code_unique",
      }),
    );
  }
}

async function addOperatorLinkConflicts(
  context: StrategyContext,
  plan: PlannedEntry,
  id: number,
  links: readonly OperatorLink[],
): Promise<OperatorLink[]> {
  if (links.length === 0) return [];

  const linkedIds = links.map((link) => link.operatorId);
  const [rows, memberRows] = await Promise.all([
    context.tx.select({ id: operators.id }).from(operators).where(inArray(operators.id, linkedIds)),
    context.tx
      .select({ id: operatorLinks.operatorId })
      .from(operatorLinks)
      .where(and(inArray(operatorLinks.operatorId, linkedIds), eq(operatorLinks.relatedOperatorId, id))),
  ]);
  const existingIds = new Set(rows.map((row) => row.id));
  for (const link of links) {
    if (existingIds.has(link.operatorId)) continue;
    plan.conflicts.push(
      conflictFor(plan.entry, "fk_missing", `The linked operator ${link.operatorId} no longer exists`, "drop_field", {
        constraint: "operator_links_related_operator_id_operators_id_fk",
        nullableField: "links",
      }),
    );
  }
  for (const member of memberRows) {
    plan.conflicts.push(conflictFor(plan.entry, "unique_violation", `The linked operator ${member.id} is now a member of this operator`, "skip"));
  }
  return links.filter((link) => existingIds.has(link.operatorId));
}

async function addBandUniqueConflicts(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  type BandRow = z.infer<typeof bandSelectSchema>;
  const name = stringField(target, "name");
  if (name !== null) {
    const [duplicate] = await context.tx
      .select({ id: bands.id })
      .from(bands)
      .where(and(eq(bands.name, name), ne(bands.id, id)))
      .limit(1);
    if (duplicate !== undefined)
      plan.conflicts.push(
        conflictFor(plan.entry, "unique_violation", "The original band name is already in use", "skip", { constraint: "bands_name_unique" }),
      );
  }

  const rat = stringField(target, "rat");
  if (rat === null) return;
  const value = numberField(target, "value");
  const duplex = stringField(target, "duplex");
  const variant = stringField(target, "variant");
  if (variant === null) return;
  const code = stringField(target, "code");
  const [duplicate] = await context.tx
    .select({ id: bands.id })
    .from(bands)
    .where(
      and(
        eq(bands.rat, rat as BandRow["rat"]),
        value === null ? isNull(bands.value) : eq(bands.value, value),
        duplex === null ? isNull(bands.duplex) : eq(bands.duplex, duplex as NonNullable<BandRow["duplex"]>),
        eq(bands.variant, variant as BandRow["variant"]),
        code === null ? isNull(bands.code) : eq(bands.code, code),
        ne(bands.id, id),
      ),
    )
    .limit(1);
  if (duplicate !== undefined)
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The original band definition is already in use", "skip", {
        constraint: "bands_rat_value_unique",
      }),
    );

  if (code === null) return;
  const [codeDuplicate] = await context.tx
    .select({ id: bands.id })
    .from(bands)
    .where(and(eq(bands.code, code), eq(bands.variant, variant as BandRow["variant"]), ne(bands.id, id)))
    .limit(1);
  if (codeDuplicate !== undefined) {
    plan.conflicts.push(
      conflictFor(plan.entry, "unique_violation", "The original band code is already in use", "skip", {
        constraint: "bands_code_variant_unique",
      }),
    );
  }
}

function operationCountryBands(operationEntries: readonly AuditEntry[], op: "create" | "delete", bandId: number): OperationCountryBand[] {
  return operationEntries.flatMap((candidate) => {
    if (candidate.entity !== "country_bands" || candidate.op !== op) return [];
    const row = op === "create" ? candidate.new_values : candidate.old_values;
    if (!isSnapshotRecord(row) || numberField(row, "bandId") !== bandId) return [];
    const countryCode = stringField(row, "countryCode");
    return countryCode === null ? [] : [{ entry: candidate, countryCode, row }];
  });
}

async function findRestorableCountryBands(
  handle: Database | DbTx,
  operationEntries: readonly AuditEntry[],
  bandId: number,
): Promise<OperationCountryBand[]> {
  const removed = operationCountryBands(operationEntries, "delete", bandId);
  if (removed.length === 0) return [];

  const rows = await handle
    .select({ code: countries.code })
    .from(countries)
    .where(
      inArray(
        countries.code,
        removed.map((countryBand) => countryBand.countryCode),
      ),
    );
  const existingCountryCodes = new Set(rows.map((row) => row.code));
  return removed.filter((countryBand) => existingCountryCodes.has(countryBand.countryCode));
}

export async function findRestoringBandEntries(handle: Database | DbTx, operationEntries: readonly AuditEntry[]): Promise<Map<number, AuditEntry>> {
  const restoringBandEntries = new Map<number, AuditEntry>();
  const bandRemovals = operationEntries.filter((entry) => entry.entity === "bands" && entry.op === "delete");
  await Promise.all(
    bandRemovals.map(async (bandRemoval) => {
      const bandId = recordIdNumber(bandRemoval.record_id);
      if (bandId === null) return;
      const restorable = await findRestorableCountryBands(handle, operationEntries, bandId);
      for (const countryBand of restorable) restoringBandEntries.set(countryBand.entry.id, bandRemoval);
    }),
  );
  return restoringBandEntries;
}

async function restoreCountryBands(tx: DbTx, bandId: number, removed: readonly OperationCountryBand[]): Promise<CountryBandRow[]> {
  if (removed.length === 0) return [];

  const rows = removed.map((countryBand) => ({ ...snapshotToRow(countryBands, countryBand.row), bandId }));
  return tx
    .insert(countryBands)
    .values(rows as z.infer<typeof countryBandInsertSchema>[])
    .returning();
}

function countryBandCreateEntries(rows: readonly CountryBandRow[]): AuditEntryInput[] {
  return rows.map((row) => ({ entity: "country_bands", op: "create", recordId: `${row.countryCode}:${row.bandId}`, new: row }));
}

async function addRegionUniqueConflicts(context: StrategyContext, plan: PlannedEntry, id: number, target: SnapshotRecord): Promise<void> {
  const checks = [
    ["name", regions.name, "regions_country_name_unique"],
    ["code", regions.code, "regions_country_code_unique"],
  ] as const;
  const countryCode = stringField(target, "countryCode") ?? LEGACY_COUNTRY_CODE;
  const duplicates = await Promise.all(
    checks.map(async ([field, column]) => {
      const value = stringField(target, field);
      if (value === null) return false;
      const [duplicate] = await context.tx
        .select({ id: regions.id })
        .from(regions)
        .where(and(eq(column, value), eq(regions.countryCode, countryCode), ne(regions.id, id)))
        .limit(1);
      return duplicate !== undefined;
    }),
  );
  for (const [index, [field, _column, constraint]] of checks.entries()) {
    if (!duplicates[index]) continue;
    plan.conflicts.push(conflictFor(plan.entry, "unique_violation", `The original region ${field} is already in use`, "skip", { constraint }));
  }
}

async function planOperatorRevert(context: StrategyContext, entry: AuditEntry, id: number): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const [current] = await context.tx.select().from(operators).where(eq(operators.id, id)).limit(1);
  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The operator is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new operator");
    const fields = snapshotFieldNames(expected);
    const differences = staleFields(operators, expected, current, fields);
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The operator changed after this operation", "apply", { fields: differences }));
    const [dependents, details] = await Promise.all([operatorDependents(context, plan, id), loadOperatorDetails(context.tx, [id])]);
    if (dependents.length > 0) plan.conflicts.push(conflictFor(entry, "referenced", "The operator is still referenced", "skip", { dependents }));
    const { plmns: removedPlmns, links: removedLinks } = toOperator(current, details.get(id));
    plan.actions.push({
      order: 52,
      run: async (tx, state) => {
        await markOperatorStations(tx, state, id);
        await tx.delete(operators).where(eq(operators.id, id));
      },
    });
    plan.finalize = async (_tx, audit) =>
      audit.log({
        entity: "operators",
        op: "delete",
        recordId: id,
        old: current,
        new: null,
        metadata: { ...inverseMetadata(entry.id, plan.droppedFields), plmns: removedPlmns, links: removedLinks },
      });
    return plan;
  }
  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "An operator with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old operator");
    const removed = removedOperatorDetails(entry);
    const otherPlmns = removed.plmns.filter((plmn) => plmn.role !== "primary");
    const [, parentProvider, restorableLinks] = await Promise.all([
      addOperatorUniqueConflicts(context, plan, id, oldValues),
      addOperatorParentConflict(context, plan, oldValues, new Set(["parent_id"])),
      addOperatorLinkConflicts(context, plan, id, removed.links),
      addOperatorBrandConflict(context, plan, oldValues, new Set(["brandId"])),
      addOperatorCodeConflicts(context, plan, id, otherPlmns),
    ]);
    const parentId = numberField(oldValues, "parent_id");
    plan.actions.push({
      order: 21,
      run: async (tx, state) => {
        const row = snapshotToRow(operators, oldValues, { includeIdentity: true });
        if (plan.droppedFields.has("brandId")) row.brandId = null;
        const deferredParent = parentProvider !== undefined;
        await tx
          .insert(operators)
          .overridingSystemValue()
          .values({
            ...row,
            id,
            parent_id: plan.droppedFields.has("parent_id") || deferredParent ? null : parentId,
          } as z.infer<typeof operatorInsertSchema>);
        if (otherPlmns.length > 0) await tx.insert(plmns).values(otherPlmns.map(({ mcc, mnc, role }) => ({ mcc, mnc, operatorId: id, role })));
        if (restorableLinks.length > 0) await replaceLinks(tx, id, restorableLinks);
        state.sequenceTables.add("operators");
      },
    });
    if (parentId !== null && parentProvider !== undefined)
      plan.actions.push({
        order: 30,
        run: async (tx) => {
          if (plan.droppedFields.has("parent_id")) return;
          await tx.update(operators).set({ parent_id: parentId }).where(eq(operators.id, id));
        },
      });
    plan.finalize = async (tx, audit) => {
      const [[restored], details] = await Promise.all([
        tx.select().from(operators).where(eq(operators.id, id)).limit(1),
        loadOperatorDetails(tx, [id]),
      ]);
      if (restored === undefined) throw new Error(`Restored operator ${id} disappeared`);
      const { plmns: restoredPlmns, links: restoredLinks } = toOperator(restored, details.get(id));
      await audit.log({
        entity: "operators",
        op: "create",
        recordId: id,
        old: null,
        new: restored,
        metadata: { ...inverseMetadata(entry.id, plan.droppedFields), plmns: restoredPlmns, links: restoredLinks },
      });
    };
    return plan;
  }
  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The operator no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old operator");
  const newValues = requireSnapshot(entry.new_values, "new operator");
  const changed = changedOperatorDetails(entry);
  const fields = changedFields(operators, oldValues, newValues);
  const currentDetails = await loadOperatorDetails(context.tx, [id]);
  const { plmns: currentPlmns, links: currentLinks } = toOperator(current, currentDetails.get(id));
  const differences = staleFields(operators, newValues, current, fields);
  if (changed.plmns !== undefined && !valuesEqual(changed.plmns.new, currentPlmns)) {
    differences.push({ field: "plmns", expected: changed.plmns.new, current: currentPlmns });
  }
  if (changed.links !== undefined && !valuesEqual(changed.links.new, currentLinks)) {
    differences.push({ field: "links", expected: changed.links.new, current: currentLinks });
  }
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The operator changed after this operation", "apply", { fields: differences }));
  const otherPlmns = (changed.plmns?.old ?? []).filter((plmn) => plmn.role !== "primary");
  const [, , , restorableLinks] = await Promise.all([
    addOperatorUniqueConflicts(context, plan, id, oldValues),
    addOperatorParentConflict(context, plan, oldValues, new Set(fields)),
    addOperatorBrandConflict(context, plan, oldValues, new Set(fields)),
    addOperatorLinkConflicts(context, plan, id, changed.links?.old ?? []),
    addOperatorCodeConflicts(context, plan, id, otherPlmns),
  ]);
  plan.actions.push({
    order: 30,
    run: async (tx, state) => {
      await markOperatorStations(tx, state, id);
      const patch = snapshotToRow(operators, oldValues, { fields });
      if (plan.droppedFields.has("parent_id")) patch.parent_id = null;
      if (plan.droppedFields.has("brandId")) patch.brandId = null;
      if (fields.length > 0) await tx.update(operators).set(patch).where(eq(operators.id, id));
      if (changed.plmns !== undefined) await replacePlmns(tx, id, changed.plmns.old);
      if (changed.links !== undefined) await replaceLinks(tx, id, restorableLinks);
    },
  });
  plan.finalize = async (tx, audit) => {
    const [[restored], details] = await Promise.all([
      tx.select().from(operators).where(eq(operators.id, id)).limit(1),
      loadOperatorDetails(tx, [id]),
    ]);
    if (restored === undefined) throw new Error(`Updated operator ${id} disappeared`);
    const { plmns: restoredPlmns, links: restoredLinks } = toOperator(restored, details.get(id));
    const metadata = inverseMetadata(entry.id, plan.droppedFields);
    if (changed.plmns !== undefined) metadata.plmns = { old: currentPlmns, new: restoredPlmns };
    if (changed.links !== undefined) metadata.links = { old: currentLinks, new: restoredLinks };
    await audit.log({ entity: "operators", op: "update", recordId: id, old: current, new: restored, metadata });
  };
  return plan;
}

async function planBandRevert(context: StrategyContext, entry: AuditEntry, id: number): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const [current] = await context.tx.select().from(bands).where(eq(bands.id, id)).limit(1);
  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The band is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new band");
    const differences = staleFields(bands, expected, current, snapshotFieldNames(expected));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The band changed after this operation", "apply", { fields: differences }));
    const dependents = await bandDependents(context, plan, id);
    if (dependents.length > 0) plan.conflicts.push(conflictFor(entry, "referenced", "The band is still referenced", "skip", { dependents }));
    const createdCountryBands = operationCountryBands(context.operationEntries, "create", id);
    let removedCountryBands: CountryBandRow[] = [];
    plan.actions.push({
      order: 51,
      run: async (tx, state) => {
        await markBandStations(tx, state, id);
        removedCountryBands = await tx.delete(countryBands).where(eq(countryBands.bandId, id)).returning();
        await tx.delete(bands).where(eq(bands.id, id));
        const removedCountryCodes = new Set(removedCountryBands.map((row) => row.countryCode));
        for (const created of createdCountryBands) {
          if (removedCountryCodes.has(created.countryCode)) state.indirectlyRevertedEntryIds.add(created.entry.id);
        }
      },
    });
    plan.finalize = async (_tx, audit) =>
      audit.logMany([
        ...countryBandDeleteEntries(removedCountryBands),
        { entity: "bands", op: "delete", recordId: id, old: current, new: null, metadata: inverseMetadata(entry.id, plan.droppedFields) },
      ]);
    return plan;
  }
  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "A band with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old band");
    const [, restorableCountryBands] = await Promise.all([
      addBandUniqueConflicts(context, plan, id, oldValues),
      findRestorableCountryBands(context.tx, context.operationEntries, id),
    ]);
    let restoredCountryBands: CountryBandRow[] = [];
    plan.actions.push({
      order: 22,
      run: async (tx, state) => {
        const row = snapshotToRow(bands, oldValues, { includeIdentity: true });
        await tx
          .insert(bands)
          .overridingSystemValue()
          .values({ ...row, id } as z.infer<typeof bandInsertSchema>);
        state.sequenceTables.add("bands");
        restoredCountryBands = await restoreCountryBands(tx, id, restorableCountryBands);
        for (const countryBand of restorableCountryBands) state.indirectlyRevertedEntryIds.add(countryBand.entry.id);
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(bands).where(eq(bands.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored band ${id} disappeared`);
      await audit.logMany([
        { entity: "bands", op: "create", recordId: id, old: null, new: restored, metadata: inverseMetadata(entry.id, plan.droppedFields) },
        ...countryBandCreateEntries(restoredCountryBands),
      ]);
    };
    return plan;
  }
  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The band no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old band");
  const newValues = requireSnapshot(entry.new_values, "new band");
  const fields = changedFields(bands, oldValues, newValues);
  const differences = staleFields(bands, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The band changed after this operation", "apply", { fields: differences }));
  await addBandUniqueConflicts(context, plan, id, oldValues);
  plan.actions.push({
    order: 30,
    run: async (tx, state) => {
      await markBandStations(tx, state, id);
      await tx
        .update(bands)
        .set(snapshotToRow(bands, oldValues, { fields }))
        .where(eq(bands.id, id));
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(bands).where(eq(bands.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated band ${id} disappeared`);
    await audit.log({
      entity: "bands",
      op: "update",
      recordId: id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}

async function planRegionRevert(context: StrategyContext, entry: AuditEntry, id: number): Promise<PlannedEntry> {
  const plan = createEmptyPlan(entry);
  const [current] = await context.tx.select().from(regions).where(eq(regions.id, id)).limit(1);
  if (entry.op === "create") {
    if (current === undefined) {
      plan.skip = { entry_id: entry.id, reason: "already_absent", message: "The region is already absent" };
      return plan;
    }
    const expected = requireSnapshot(entry.new_values, "new region");
    const differences = staleFields(regions, expected, current, snapshotFieldNames(expected));
    if (differences.length > 0)
      plan.conflicts.push(conflictFor(entry, "stale", "The region changed after this operation", "apply", { fields: differences }));
    const dependents = await regionDependents(context, plan, id);
    if (dependents.length > 0) plan.conflicts.push(conflictFor(entry, "referenced", "The region is still referenced", "skip", { dependents }));
    plan.actions.push({
      order: 53,
      run: async (tx, state) => {
        await markRegionStations(tx, state, id);
        await tx.delete(regions).where(eq(regions.id, id));
      },
    });
    plan.finalize = async (_tx, audit) =>
      audit.log({ entity: "regions", op: "delete", recordId: id, old: current, new: null, metadata: inverseMetadata(entry.id, plan.droppedFields) });
    return plan;
  }
  if (entry.op === "delete") {
    if (current !== undefined) {
      plan.conflicts.push(conflictFor(entry, "exists", "A region with this id already exists", "skip"));
      return plan;
    }
    const oldValues = requireSnapshot(entry.old_values, "old region");
    await addRegionUniqueConflicts(context, plan, id, oldValues);
    plan.actions.push({
      order: 20,
      run: async (tx, state) => {
        const row = snapshotToRow(regions, oldValues, { includeIdentity: true });
        await tx
          .insert(regions)
          .overridingSystemValue()
          .values({ ...row, id } as z.infer<typeof regionInsertSchema>);
        state.sequenceTables.add("regions");
      },
    });
    plan.finalize = async (tx, audit) => {
      const [restored] = await tx.select().from(regions).where(eq(regions.id, id)).limit(1);
      if (restored === undefined) throw new Error(`Restored region ${id} disappeared`);
      await audit.log({
        entity: "regions",
        op: "create",
        recordId: id,
        old: null,
        new: restored,
        metadata: inverseMetadata(entry.id, plan.droppedFields),
      });
    };
    return plan;
  }
  if (current === undefined) {
    plan.conflicts.push(conflictFor(entry, "missing", "The region no longer exists", "skip"));
    return plan;
  }
  const oldValues = requireSnapshot(entry.old_values, "old region");
  const newValues = requireSnapshot(entry.new_values, "new region");
  const fields = changedFields(regions, oldValues, newValues);
  const differences = staleFields(regions, newValues, current, fields);
  if (differences.length > 0)
    plan.conflicts.push(conflictFor(entry, "stale", "The region changed after this operation", "apply", { fields: differences }));
  await addRegionUniqueConflicts(context, plan, id, oldValues);
  plan.actions.push({
    order: 30,
    run: async (tx, state) => {
      await markRegionStations(tx, state, id);
      await tx
        .update(regions)
        .set(snapshotToRow(regions, oldValues, { fields }))
        .where(eq(regions.id, id));
    },
  });
  plan.finalize = async (tx, audit) => {
    const [restored] = await tx.select().from(regions).where(eq(regions.id, id)).limit(1);
    if (restored === undefined) throw new Error(`Updated region ${id} disappeared`);
    await audit.log({
      entity: "regions",
      op: "update",
      recordId: id,
      old: current,
      new: restored,
      metadata: inverseMetadata(entry.id, plan.droppedFields),
    });
  };
  return plan;
}

export async function planReferenceRevert(context: StrategyContext, entry: AuditEntry): Promise<PlannedEntry> {
  const id = recordIdNumber(entry.record_id);
  if (id === null) return createEmptyPlan(entry);
  switch (entry.entity) {
    case "operators":
      return planOperatorRevert(context, entry, id);
    case "bands":
      return planBandRevert(context, entry, id);
    case "regions":
      return planRegionRevert(context, entry, id);
    default:
      return createEmptyPlan(entry);
  }
}

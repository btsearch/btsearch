/* eslint-disable no-await-in-loop */
import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { licensees, operators } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import { chunks, unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { STATEMENT_BATCH_SIZE } from "./config.js";

type LicenseeRules = Pick<OfficialSourceDefinition, "countryCode" | "shortLicenseeName" | "operatorNameOfLicensee">;
type StoredLicenseeName = { id: number; name: string; legalName: string };
type StoredShortName = { id: number; name: string; operatorId: number | null };
type UnseenLicensee = { legalName: string; name: string; operatorName: string | null };
type UnseenLicenseeMatch = { known: Map<string, ResolvedLicensee>; added: UnseenLicensee[]; sharedWith: Map<string, string> };
type NewLicensee = { legalName: string; name: string; operatorId: number | null };

export type ResolvedLicensee = { licenseeId: number; operatorId: number | null };

export function describeUnseenLicensees(publishedNames: readonly string[], rules: Omit<LicenseeRules, "countryCode">): UnseenLicensee[] {
  return publishedNames.flatMap((legalName) => {
    const name = rules.shortLicenseeName(legalName);
    return name ? [{ legalName, name, operatorName: rules.operatorNameOfLicensee(legalName) }] : [];
  });
}

export function matchUnseenLicensees(unseen: readonly UnseenLicensee[], stored: readonly StoredShortName[]): UnseenLicenseeMatch {
  const storedByShortName = Map.groupBy(stored, (licensee) => licensee.name);
  const firstAddedByShortName = new Map<string, string>();
  const match: UnseenLicenseeMatch = { known: new Map(), added: [], sharedWith: new Map() };

  for (const licensee of unseen) {
    const sameShortName = storedByShortName.get(licensee.name) ?? [];
    const [only] = sameShortName;
    const firstAdded = firstAddedByShortName.get(licensee.name);
    if (only && sameShortName.length === 1) match.known.set(licensee.legalName, { licenseeId: only.id, operatorId: only.operatorId });
    else if (sameShortName.length === 0 && firstAdded !== undefined) match.sharedWith.set(licensee.legalName, firstAdded);
    else {
      match.added.push(licensee);
      if (sameShortName.length === 0) firstAddedByShortName.set(licensee.name, licensee.legalName);
    }
  }

  return match;
}

export function licenseeNameCorrections(
  stored: readonly StoredLicenseeName[],
  shortLicenseeName: LicenseeRules["shortLicenseeName"],
): { id: number; name: string }[] {
  return stored.flatMap(({ id, name, legalName }) => {
    const shortName = shortLicenseeName(legalName);
    return shortName && shortName !== name ? [{ id, name: shortName }] : [];
  });
}

async function findOperatorIds(tx: DbTx, countryCode: string, names: readonly string[]): Promise<Map<string, number>> {
  if (names.length === 0) return new Map();

  const rows = await tx
    .select({ id: operators.id, name: operators.name })
    .from(operators)
    .where(and(eq(operators.countryCode, countryCode), inArray(operators.name, [...names])));
  return new Map(rows.map((row) => [row.name, row.id]));
}

async function readByLegalName(tx: DbTx, sourceId: number, legalNames: readonly string[]): Promise<Map<string, ResolvedLicensee>> {
  const resolved = new Map<string, ResolvedLicensee>();
  for (const group of chunks(legalNames, STATEMENT_BATCH_SIZE)) {
    const stored = await tx
      .select({ id: licensees.id, legalName: licensees.full_name, operatorId: licensees.operatorId })
      .from(licensees)
      .where(and(eq(licensees.sourceId, sourceId), inArray(licensees.full_name, group)));
    for (const row of stored) resolved.set(row.legalName, { licenseeId: row.id, operatorId: row.operatorId });
  }

  return resolved;
}

async function readByShortName(tx: DbTx, sourceId: number, shortNames: readonly string[]): Promise<StoredShortName[]> {
  const stored: StoredShortName[] = [];
  for (const group of chunks(shortNames, STATEMENT_BATCH_SIZE)) {
    stored.push(
      ...(await tx
        .select({ id: licensees.id, name: licensees.name, operatorId: licensees.operatorId })
        .from(licensees)
        .where(and(eq(licensees.sourceId, sourceId), inArray(licensees.name, group)))),
    );
  }

  return stored;
}

async function describeNewLicensees(tx: DbTx, countryCode: string, added: readonly UnseenLicensee[]): Promise<NewLicensee[]> {
  const operatorIds = await findOperatorIds(tx, countryCode, unique(added.map((licensee) => licensee.operatorName)));
  return added.map(({ legalName, name, operatorName }) => ({
    legalName,
    name,
    operatorId: operatorName === null ? null : (operatorIds.get(operatorName) ?? null),
  }));
}

async function addLicensees(tx: DbTx, sourceId: number, added: readonly NewLicensee[]): Promise<Map<string, ResolvedLicensee>> {
  const resolved = new Map<string, ResolvedLicensee>();
  for (const group of chunks(added, STATEMENT_BATCH_SIZE)) {
    const rows = await tx
      .insert(licensees)
      .values(group.map(({ legalName, name, operatorId }) => ({ sourceId, full_name: legalName, name, operatorId })))
      .returning({ id: licensees.id, legalName: licensees.full_name, operatorId: licensees.operatorId });
    for (const row of rows) resolved.set(row.legalName, { licenseeId: row.id, operatorId: row.operatorId });
  }

  return resolved;
}

export async function resolveLicensees(
  tx: DbTx,
  sourceId: number,
  rules: LicenseeRules,
  publishedNames: readonly string[],
  { addsUnmapped }: { addsUnmapped: boolean },
): Promise<Map<string, ResolvedLicensee>> {
  const resolved = await readByLegalName(tx, sourceId, publishedNames);
  const unseen = describeUnseenLicensees(
    publishedNames.filter((name) => !resolved.has(name)),
    rules,
  );
  const sameShortName = await readByShortName(tx, sourceId, unique(unseen.map(({ name }) => name)));
  const { known, added, sharedWith } = matchUnseenLicensees(unseen, sameShortName);
  for (const [legalName, licensee] of known) resolved.set(legalName, licensee);
  const newLicensees = await describeNewLicensees(tx, rules.countryCode, added);
  const licenseesToAdd = addsUnmapped ? newLicensees : newLicensees.filter((licensee) => licensee.operatorId !== null);
  for (const [legalName, licensee] of await addLicensees(tx, sourceId, licenseesToAdd)) resolved.set(legalName, licensee);
  for (const [legalName, firstAdded] of sharedWith) {
    const licensee = resolved.get(firstAdded);
    if (licensee) resolved.set(legalName, licensee);
  }

  return resolved;
}

export async function correctLicenseeNames(tx: DbTx, sourceId: number, shortLicenseeName: LicenseeRules["shortLicenseeName"]): Promise<number> {
  const stored = await tx
    .select({ id: licensees.id, name: licensees.name, legalName: licensees.full_name })
    .from(licensees)
    .where(eq(licensees.sourceId, sourceId));
  const corrections = licenseeNameCorrections(stored, shortLicenseeName);
  for (const { id, name } of corrections) await tx.update(licensees).set({ name }).where(eq(licensees.id, id));

  return corrections.length;
}

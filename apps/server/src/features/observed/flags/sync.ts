import { observationFlags } from "@openbts/drizzle";
import type { ObservationFlagClosedReason, ObservationFlagKind, ObservationFlagStatus } from "@openbts/shared/contract";
import { type SQL, and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { unique } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { type ClosedFlag, FLAG_REF_COLUMNS, type RaisedFlag, isWorthRaisingAgain } from "./kinds.js";
import type { FlagKey } from "./subjects.js";

type FlagSync = {
  kinds: readonly ObservationFlagKind[];
  lookedAt?: SQL;
  raised: readonly RaisedFlag[];
  fixed?: SQL;
  resolvedById?: string | null;
};
export type FlagSyncCounts = Readonly<{ opened: number; updated: number; resolved: number }>;

export const NOTHING_SYNCED: FlagSyncCounts = { opened: 0, updated: 0, resolved: 0 };

type LatestClosed = ClosedFlag & { kind: string; subjectKey: string; closedReason: ObservationFlagClosedReason | null };

const WRITTEN_COLUMNS = [...FLAG_REF_COLUMNS, "evidence", "suggestion", "measure"] as const;

function proposed(column: AnyPgColumn): SQL {
  return sql`excluded.${sql.identifier(column.name)}`;
}

const PROPOSED_VALUES = Object.fromEntries(WRITTEN_COLUMNS.map((name) => [name, proposed(observationFlags[name])]));
const HAS_CHANGED = or(...WRITTEN_COLUMNS.map((name) => sql`${observationFlags[name]} IS DISTINCT FROM ${proposed(observationFlags[name])}`));

export function flagStatusOf(closedReason: ObservationFlagClosedReason | null): ObservationFlagStatus {
  if (closedReason === null) return "open";
  return closedReason === "dismissed" ? "dismissed" : "resolved";
}

export function closedFlagValues(closedReason: ObservationFlagClosedReason, resolvedById: string | null) {
  return { closedReason, resolvedAt: sql`now()`, resolvedById, suggestion: null, updatedAt: sql`now()` } as const;
}

export function flagsIn(keys: readonly FlagKey[]): SQL | undefined {
  const byKind = Map.groupBy(keys, (key) => key.kind);
  return or(
    ...[...byKind].map(([kind, ofKind]) =>
      and(eq(observationFlags.kind, kind), inArray(observationFlags.subjectKey, unique(ofKind.map((key) => key.subjectKey)))),
    ),
  );
}

export function flagKeyOf({ kind, subjectKey }: { kind: string; subjectKey: string }): string {
  return `${kind} ${subjectKey}`;
}

function toInsertRow({ kind, subjectKey, refs, evidence, suggestion, measure }: RaisedFlag) {
  return { kind, subjectKey, ...refs, evidence, suggestion, measure };
}

async function lockOpenFlags(tx: DbTx, kinds: readonly ObservationFlagKind[], lookedAt: SQL | undefined, raised: readonly RaisedFlag[]) {
  const subjectKeys = unique(raised.map((flag) => flag.subjectKey));
  const raisedSubjects = subjectKeys.length === 0 ? undefined : inArray(observationFlags.subjectKey, subjectKeys);
  return tx
    .select({ id: observationFlags.id, kind: observationFlags.kind, subjectKey: observationFlags.subjectKey })
    .from(observationFlags)
    .where(
      and(
        isNull(observationFlags.closedReason),
        inArray(observationFlags.kind, [...kinds]),
        lookedAt === undefined ? undefined : or(lookedAt, raisedSubjects),
      ),
    )
    .orderBy(asc(observationFlags.id))
    .for("update");
}

async function loadLatestClosed(tx: DbTx, raised: readonly RaisedFlag[]): Promise<Map<string, LatestClosed>> {
  if (raised.length === 0) return new Map();

  const rows = await tx
    .selectDistinctOn([observationFlags.kind, observationFlags.subjectKey], {
      kind: observationFlags.kind,
      subjectKey: observationFlags.subjectKey,
      closedReason: observationFlags.closedReason,
      measure: observationFlags.measure,
    })
    .from(observationFlags)
    .where(
      and(
        isNotNull(observationFlags.closedReason),
        inArray(observationFlags.kind, unique(raised.map((flag) => flag.kind))),
        inArray(observationFlags.subjectKey, unique(raised.map((flag) => flag.subjectKey))),
      ),
    )
    .orderBy(observationFlags.kind, observationFlags.subjectKey, desc(observationFlags.resolvedAt), desc(observationFlags.id));
  return new Map(rows.map((row) => [flagKeyOf(row), row]));
}

async function findFixedIds(tx: DbTx, staleIds: readonly number[], fixed: SQL | undefined): Promise<Set<number>> {
  if (staleIds.length === 0 || fixed === undefined) return new Set();

  const rows = await tx
    .select({ id: observationFlags.id })
    .from(observationFlags)
    .where(and(inArray(observationFlags.id, [...staleIds]), fixed));
  return new Set(rows.map((row) => row.id));
}

function isWorthOpening(latest: LatestClosed | undefined, raised: RaisedFlag): boolean {
  if (latest === undefined || latest.closedReason !== "dismissed") return true;
  return isWorthRaisingAgain(latest, raised);
}

export async function closeFlags(
  tx: DbTx,
  ids: readonly number[],
  closedReason: ObservationFlagClosedReason,
  resolvedById: string | null,
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(observationFlags)
    .set(closedFlagValues(closedReason, resolvedById))
    .where(inArray(observationFlags.id, [...ids]));
}

export async function syncFlags(tx: DbTx, { kinds, lookedAt, raised, fixed, resolvedById = null }: FlagSync): Promise<FlagSyncCounts> {
  const raisedByKey = new Map(raised.map((flag) => [flagKeyOf(flag), flag]));
  const raisedFlags = [...raisedByKey.values()];
  const open = await lockOpenFlags(tx, kinds, lookedAt, raisedFlags);
  const openKeys = new Set(open.map(flagKeyOf));

  const staleIds = open.filter((flag) => !raisedByKey.has(flagKeyOf(flag))).map((flag) => flag.id);
  const fixedIds = await findFixedIds(tx, staleIds, fixed);
  const goneIds = staleIds.filter((id) => !fixedIds.has(id));
  await closeFlags(tx, [...fixedIds], "fixedElsewhere", resolvedById);
  await closeFlags(tx, goneIds, "evidenceGone", resolvedById);

  const notOpen = raisedFlags.filter((flag) => !openKeys.has(flagKeyOf(flag)));
  const latestClosed = await loadLatestClosed(tx, notOpen);
  const written = raisedFlags.filter((flag) => openKeys.has(flagKeyOf(flag)) || isWorthOpening(latestClosed.get(flagKeyOf(flag)), flag));
  if (written.length === 0) return { opened: 0, updated: 0, resolved: staleIds.length };

  const changed = await tx
    .insert(observationFlags)
    .values(written.map(toInsertRow))
    .onConflictDoUpdate({
      target: [observationFlags.kind, observationFlags.subjectKey],
      targetWhere: sql`closed_reason IS NULL`,
      set: { ...PROPOSED_VALUES, updatedAt: sql`now()` },
      setWhere: HAS_CHANGED,
    })
    .returning({ kind: observationFlags.kind, subjectKey: observationFlags.subjectKey });
  const updated = changed.filter((flag) => openKeys.has(flagKeyOf(flag))).length;
  return { opened: changed.length - updated, updated, resolved: staleIds.length };
}

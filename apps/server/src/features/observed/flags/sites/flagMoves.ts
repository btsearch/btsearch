import { observationFlags, observedSites } from "@openbts/drizzle";
import type { ObservationFlagClosedReason, ObservationFlagKind } from "@openbts/shared/contract";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { SITE_FLAG_KINDS } from "../kinds.js";
import { observedSiteSubject } from "../subjects.js";
import { closeFlags, flagKeyOf } from "../sync.js";

type FlagMove = { fromSubjectKey: string; toSubjectKey: string; observedSiteId: number };
type HeldFlag = { id: number; kind: string; subjectKey: string; closedReason: ObservationFlagClosedReason | null };
type FlagMovePlan = { resolvedIds: number[]; rewrites: { id: number; subjectKey: string; observedSiteId: number }[] };
type SiteSuccession = { observedSiteId: number; replacedBySiteId: number };

export type SuccessionFlag = HeldFlag & { observedSiteId: number | null; resolvedAt: Date | null };

export function planFlagMoves(flags: readonly HeldFlag[], moves: readonly FlagMove[]): FlagMovePlan {
  const openKeys = new Set(flags.filter((flag) => flag.closedReason === null).map(flagKeyOf));
  const heldKeys = new Set(flags.map(flagKeyOf));
  const plan: FlagMovePlan = { resolvedIds: [], rewrites: [] };

  for (const { fromSubjectKey, toSubjectKey, observedSiteId } of moves) {
    for (const flag of flags.filter((candidate) => candidate.subjectKey === fromSubjectKey)) {
      const target = flagKeyOf({ kind: flag.kind, subjectKey: toSubjectKey });
      const isOpen = flag.closedReason === null;
      if (isOpen && openKeys.has(target)) {
        plan.resolvedIds.push(flag.id);
        continue;
      }
      if (!isOpen && heldKeys.has(target)) continue;

      plan.rewrites.push({ id: flag.id, subjectKey: toSubjectKey, observedSiteId });
      heldKeys.add(target);
      if (isOpen) {
        openKeys.delete(flagKeyOf(flag));
        openKeys.add(target);
      }
    }
  }
  return plan;
}

export async function moveFlags(tx: DbTx, kinds: readonly ObservationFlagKind[], moves: readonly FlagMove[]): Promise<void> {
  if (moves.length === 0) return;

  const flags = await tx
    .select({
      id: observationFlags.id,
      kind: observationFlags.kind,
      subjectKey: observationFlags.subjectKey,
      closedReason: observationFlags.closedReason,
    })
    .from(observationFlags)
    .where(
      and(
        inArray(observationFlags.kind, [...kinds]),
        inArray(observationFlags.subjectKey, unique(moves.flatMap((move) => [move.fromSubjectKey, move.toSubjectKey]))),
        or(isNull(observationFlags.closedReason), eq(observationFlags.closedReason, "dismissed")),
      ),
    )
    .orderBy(asc(observationFlags.id))
    .for("update");
  const { resolvedIds, rewrites } = planFlagMoves(flags, moves);
  await closeFlags(tx, resolvedIds, "evidenceGone", null);
  for (const { id, subjectKey, observedSiteId } of rewrites) {
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(observationFlags)
      .set({ subjectKey, observedSiteId, updatedAt: sql`now()` })
      .where(eq(observationFlags.id, id));
  }
}

function latestDismissals<Flag extends SuccessionFlag>(flags: readonly Flag[]): Flag[] {
  const bySiteAndKind = Map.groupBy(flags, (flag) => `${flag.observedSiteId} ${flag.kind}`);
  return [...bySiteAndKind.values()].flatMap((ofKind) => {
    if (ofKind.some((flag) => flag.closedReason === null)) return [];
    const [latest] = ofKind.toSorted((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0) || b.id - a.id);
    return latest?.closedReason === "dismissed" ? [latest] : [];
  });
}

export function planCarriedDismissals<Flag extends SuccessionFlag>(
  flags: readonly Flag[],
  successions: readonly SiteSuccession[],
  successorKeys: ReadonlyMap<number, string>,
  heldFlags: readonly { kind: string; subjectKey: string }[],
): (Flag & { subjectKey: string; observedSiteId: number })[] {
  const dismissalsBySite = Map.groupBy(latestDismissals(flags), (flag) => flag.observedSiteId);
  const held = new Set(heldFlags.map(flagKeyOf));
  const carried: (Flag & { subjectKey: string; observedSiteId: number })[] = [];
  for (const { observedSiteId, replacedBySiteId } of successions.toSorted((a, b) => a.observedSiteId - b.observedSiteId)) {
    const subjectKey = successorKeys.get(replacedBySiteId);
    if (subjectKey === undefined) continue;
    for (const flag of dismissalsBySite.get(observedSiteId) ?? []) {
      const key = flagKeyOf({ kind: flag.kind, subjectKey });
      if (held.has(key)) continue;
      held.add(key);
      carried.push({ ...flag, subjectKey, observedSiteId: replacedBySiteId });
    }
  }
  return carried;
}

export async function passDismissalsToSuccessors(tx: DbTx, successions: readonly SiteSuccession[]): Promise<void> {
  if (successions.length === 0) return;

  const flags = await tx
    .select()
    .from(observationFlags)
    .where(
      and(
        inArray(observationFlags.kind, [...SITE_FLAG_KINDS]),
        inArray(observationFlags.observedSiteId, unique(successions.map((succession) => succession.observedSiteId))),
      ),
    );
  if (!flags.some((flag) => flag.closedReason === "dismissed")) return;

  const successors = await tx
    .select({
      id: observedSites.id,
      plmn: observedSites.plmn,
      rat: observedSites.rat,
      nodeId: observedSites.nodeId,
      stationId: observedSites.stationId,
    })
    .from(observedSites)
    .where(inArray(observedSites.id, unique(successions.map((succession) => succession.replacedBySiteId))));
  const successorKeys = new Map(successors.map((site) => [site.id, observedSiteSubject(site)]));
  const held = await tx
    .select({ kind: observationFlags.kind, subjectKey: observationFlags.subjectKey })
    .from(observationFlags)
    .where(and(inArray(observationFlags.kind, [...SITE_FLAG_KINDS]), inArray(observationFlags.subjectKey, unique([...successorKeys.values()]))));

  const carried = planCarriedDismissals(flags, successions, successorKeys, held);
  if (carried.length === 0) return;
  await tx.insert(observationFlags).values(carried.map(({ id: _id, updatedAt: _updatedAt, ...flag }) => flag));
}

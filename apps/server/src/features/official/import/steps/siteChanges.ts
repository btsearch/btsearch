import type { ChangeKind, ChangeRow } from "../types.js";

type SiteTally = { lastSeq: number; wasAdded: boolean; addedPermitIds: Set<number>; archivedPermitIds: Set<number> };

export type SiteChangeSummary = { officialSiteId: number; lastSeq: number; wasAdded: boolean; permitsAdded: number; permitsArchived: number };

const ADDED_PERMIT_KINDS: readonly ChangeKind[] = ["permit_added", "permit_moved_in"];
const ARCHIVED_PERMIT_KINDS: readonly ChangeKind[] = ["permit_archived", "permit_moved_out"];

export const SITE_CHANGE_KINDS: readonly ChangeKind[] = ["site_added", ...ADDED_PERMIT_KINDS, ...ARCHIVED_PERMIT_KINDS];

export function summarizeSiteChanges(changes: readonly ChangeRow[]): SiteChangeSummary[] {
  const tallies = new Map<number, SiteTally>();
  for (const change of changes) {
    if (change.officialSiteId === null) continue;

    const known = tallies.get(change.officialSiteId);
    const tally = known ?? { lastSeq: change.seq, wasAdded: false, addedPermitIds: new Set<number>(), archivedPermitIds: new Set<number>() };
    if (!known) tallies.set(change.officialSiteId, tally);

    tally.lastSeq = Math.max(tally.lastSeq, change.seq);
    if (change.kind === "site_added") tally.wasAdded = true;
    if (ADDED_PERMIT_KINDS.includes(change.kind) && change.permitId !== null) tally.addedPermitIds.add(change.permitId);
    if (ARCHIVED_PERMIT_KINDS.includes(change.kind) && change.permitId !== null) tally.archivedPermitIds.add(change.permitId);
  }

  return [...tallies]
    .map(([officialSiteId, tally]) => ({
      officialSiteId,
      lastSeq: tally.lastSeq,
      wasAdded: tally.wasAdded,
      permitsAdded: tally.addedPermitIds.difference(tally.archivedPermitIds).size,
      permitsArchived: tally.archivedPermitIds.difference(tally.addedPermitIds).size,
    }))
    .toSorted((first, second) => first.lastSeq - second.lastSeq);
}

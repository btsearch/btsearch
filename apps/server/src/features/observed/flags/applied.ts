import { matchQueue, observationFlags, observedCells } from "@openbts/drizzle";
import type { CellApplyConflict, ObservationFlagKind } from "@openbts/shared/contract";
import { asc, inArray } from "drizzle-orm";

import { DetailedErrorResponse } from "../../../errors.js";
import { unique } from "../../../lib/collections.js";
import { toFieldPath } from "../../../lib/fieldPath.js";
import { itemRefusal } from "../../../lib/itemRefusals.js";
import type { DbTx } from "../../../types/global.js";
import { closedFlagValues } from "./sync.js";

const CELL_APPLY_FLAG_KINDS: ReadonlySet<ObservationFlagKind> = new Set([
  "cellMissing",
  "valueDiffers",
  "valueMissing",
  "networkMissing",
  "networkNotSeen",
  "suggestedSite",
  "renumbered",
]);

export type FlagClaim = { flagIds: readonly number[]; stationId: number; path: readonly PropertyKey[] };
export type AppliedFlag = { id: number; observedCellId: number | null; observedSiteId: number | null };

function closedFlagsMessage(closed: readonly CellApplyConflict[]): string {
  const ids = closed.map((flag) => flag.observationFlagId);
  return ids.length === 1 ? `Flag ${ids[0]} is no longer open` : `Flags ${ids.join(", ")} are no longer open`;
}

export async function lockClaimedFlags(tx: DbTx, claims: readonly FlagClaim[]): Promise<AppliedFlag[]> {
  const flagIds = unique(claims.flatMap((claim) => claim.flagIds));
  if (flagIds.length === 0) return [];

  const flags = await tx
    .select({
      id: observationFlags.id,
      kind: observationFlags.kind,
      stationId: observationFlags.stationId,
      closedReason: observationFlags.closedReason,
      observedCellId: observationFlags.observedCellId,
      observedSiteId: observationFlags.observedSiteId,
    })
    .from(observationFlags)
    .where(inArray(observationFlags.id, flagIds))
    .orderBy(asc(observationFlags.id))
    .for("update");
  const flagsById = new Map(flags.map((flag) => [flag.id, flag]));

  const closed: CellApplyConflict[] = [];
  for (const { flagIds: claimed, stationId, path } of claims) {
    for (const [position, flagId] of claimed.entries()) {
      const flag = flagsById.get(flagId);
      const at = [...path, position];
      if (flag === undefined) throw itemRefusal("NOT_FOUND", `Flag ${flagId} does not exist`, at);
      if (flag.stationId !== stationId) throw itemRefusal("BAD_REQUEST", `Flag ${flagId} is about another station`, at);
      if (!CELL_APPLY_FLAG_KINDS.has(flag.kind)) throw itemRefusal("BAD_REQUEST", `A ${flag.kind} flag is not applied with this request`, at);
      if (flag.closedReason !== null) {
        closed.push({ kind: "flagClosed", field: toFieldPath(at), observationFlagId: flagId, closedReason: flag.closedReason });
      }
    }
  }
  if (closed.length > 0) throw new DetailedErrorResponse("CONFLICT", closed, { message: closedFlagsMessage(closed) });
  return flags;
}

export async function closeAppliedFlags(tx: DbTx, flags: readonly AppliedFlag[], resolvedById: string | null, madeStationId?: number): Promise<void> {
  if (flags.length === 0) return;

  await tx
    .update(observationFlags)
    .set({ ...closedFlagValues("applied", resolvedById), ...(madeStationId === undefined ? {} : { stationId: madeStationId }) })
    .where(
      inArray(
        observationFlags.id,
        flags.map((flag) => flag.id),
      ),
    );

  const siteIds = unique(flags.filter((flag) => flag.observedCellId === null).map((flag) => flag.observedSiteId));
  const siteCells =
    siteIds.length === 0 ? [] : await tx.select({ id: observedCells.id }).from(observedCells).where(inArray(observedCells.observedSiteId, siteIds));
  const observedCellIds = unique([...flags.map((flag) => flag.observedCellId), ...siteCells.map((cell) => cell.id)]);
  if (observedCellIds.length > 0) {
    await tx
      .insert(matchQueue)
      .values(observedCellIds.map((observedCellId) => ({ observedCellId })))
      .onConflictDoNothing();
  }
}

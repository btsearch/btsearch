import { cellCopies, observedCells } from "@openbts/drizzle";
import type { ObservedCell, ObservedCellSite } from "@openbts/shared/contract";
import { plmnCandidates } from "@openbts/shared/operatorUtils";
import { and, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";
import { withCodeVariants } from "../observed/networks.js";
import { loadSitesSeenBy } from "../observed/sites/read.js";
import type { DATABASE_RATS } from "../stations/serialize.js";

export type ObservedIdentity = { plmn: string; rat: (typeof DATABASE_RATS)[ObservedCell["rat"]]; cellKey: number };
export type ObservedPlacement = { observedCellId: number | null; observedSiteId: number | null };
export type ObservedSiteMatches = { placements: ObservedPlacement[]; sites: ObservedCellSite[] };
type FoundCell = { plmn: string; cellId: number; siteId: number | null };

const primaryCells = alias(observedCells, "primary_cells");
const NOT_PLACED: ObservedPlacement = { observedCellId: null, observedSiteId: null };

function lookupKey(rat: string, cellKey: number): string {
  return `${rat}:${cellKey}`;
}

async function loadObservedCells(identities: readonly ObservedIdentity[]): Promise<Map<string, FoundCell[]>> {
  if (identities.length === 0) return new Map();

  const identitiesByRat = Map.groupBy(identities, (identity) => identity.rat);
  const rows = await db
    .select({
      plmn: observedCells.plmn,
      rat: observedCells.rat,
      cellKey: observedCells.cellKey,
      id: observedCells.id,
      observedSiteId: observedCells.observedSiteId,
      primaryCellId: cellCopies.primaryCellId,
      primarySiteId: primaryCells.observedSiteId,
    })
    .from(observedCells)
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, observedCells.id))
    .leftJoin(primaryCells, eq(primaryCells.id, cellCopies.primaryCellId))
    .where(
      and(
        inArray(observedCells.plmn, withCodeVariants(identities.map((identity) => identity.plmn))),
        or(
          ...[...identitiesByRat].map(([rat, ratIdentities]) =>
            and(eq(observedCells.rat, rat), inArray(observedCells.cellKey, unique(ratIdentities.map((identity) => identity.cellKey)))),
          ),
        ),
      ),
    );

  const cells = new Map<string, FoundCell[]>();
  for (const row of rows) {
    const key = lookupKey(row.rat, row.cellKey);
    const cell = { plmn: row.plmn, cellId: row.primaryCellId ?? row.id, siteId: row.primaryCellId === null ? row.observedSiteId : row.primarySiteId };
    cells.set(key, [...(cells.get(key) ?? []), cell]);
  }
  return cells;
}

function findCell(cells: ReadonlyMap<string, FoundCell[]>, { plmn, rat, cellKey }: ObservedIdentity): FoundCell | undefined {
  const candidates = (cells.get(lookupKey(rat, cellKey)) ?? []).filter((cell) => plmnCandidates(plmn).includes(cell.plmn));
  return candidates.find((cell) => cell.plmn === plmn) ?? candidates[0];
}

export async function findObservedSites(req: FastifyRequest, identities: readonly (ObservedIdentity | null)[]): Promise<ObservedSiteMatches> {
  if (!getRuntimeSettings().observationsEnabled) return { placements: identities.map(() => NOT_PLACED), sites: [] };

  const cells = await loadObservedCells(identities.filter((identity) => identity !== null));
  const found = identities.map((identity) => (identity === null ? undefined : findCell(cells, identity)));
  const shownSites = await loadSitesSeenBy(req, unique(found.flatMap((cell) => cell?.siteId ?? [])));
  const placements = found.map((cell) =>
    cell !== undefined && cell.siteId !== null && shownSites.has(cell.siteId)
      ? { observedCellId: cell.cellId, observedSiteId: cell.siteId }
      : NOT_PLACED,
  );
  return { placements, sites: [...shownSites.values()].sort((a, b) => a.id - b.id) };
}

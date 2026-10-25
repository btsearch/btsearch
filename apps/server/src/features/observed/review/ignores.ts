import { observedCells, siteIgnores } from "@openbts/drizzle";
import { inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { type AuditRecorder, runAuditedOperation, systemAuditContext } from "../../audit/index.js";
import type { LockedCell } from "../cells/locks.js";
import { isFlagSubject, membersOf, metersBetween, shownPoint } from "../flags/sites/flaggedSite.js";
import type { ObservedSiteRecord } from "../sites/read.js";
import type { Point } from "../tiles/squares.js";

const siteIgnoreSelectSchema = createSelectSchema(siteIgnores);

export type SiteIgnoreRow = z.infer<typeof siteIgnoreSelectSchema>;

type NewIgnore = Omit<SiteIgnoreRow, "ignoredAt">;
type StoredIgnore = { observedSiteId: number; observedCellIds: readonly number[]; point: Point | null; uncertaintyM: number | null };
type SiteCellRef = { id: number; observedSiteId: number | null };

function ignoreSnapshot<Ignore extends object>(ignore: Ignore, countryCode: string | null): Ignore & { countryCode: string | null } {
  return { ...ignore, countryCode };
}

function hasMovedAway(ignore: StoredIgnore, point: Point | null): boolean {
  if (ignore.point === null || ignore.uncertaintyM === null || point === null) return false;
  return metersBetween(point, ignore.point) > ignore.uncertaintyM;
}

export function staleIgnoreIds(site: ObservedSiteRecord, ignores: readonly StoredIgnore[], cells: readonly SiteCellRef[]): number[] {
  const memberIds = new Set(membersOf(site));
  const groupIgnores = ignores.filter((ignore) => memberIds.has(ignore.observedSiteId));
  const ignoredCellIds = new Set(groupIgnores.flatMap((ignore) => ignore.observedCellIds));
  const hasNewCell = cells.some((cell) => cell.observedSiteId !== null && memberIds.has(cell.observedSiteId) && !ignoredCellIds.has(cell.id));
  const point = shownPoint(site);
  const isStale = hasNewCell || groupIgnores.some((ignore) => hasMovedAway(ignore, point));
  return isStale ? groupIgnores.map((ignore) => ignore.observedSiteId) : [];
}

export async function liftStaleIgnores(sites: readonly ObservedSiteRecord[]): Promise<boolean> {
  const ignoredIds = new Set(sites.filter((site) => site.status === "ignored").map((site) => site.id));
  const ignoredGroups = sites.filter((site) => isFlagSubject(site) && membersOf(site).some((siteId) => ignoredIds.has(siteId)));
  const memberIds = unique(ignoredGroups.flatMap(membersOf));
  if (memberIds.length === 0) return false;

  const [stored, memberCells] = await Promise.all([
    db
      .select({
        observedSiteId: siteIgnores.observedSiteId,
        observedCellIds: siteIgnores.observedCellIds,
        latitude: sql<number | null>`ST_Y(${siteIgnores.point})`,
        longitude: sql<number | null>`ST_X(${siteIgnores.point})`,
        uncertaintyM: siteIgnores.uncertaintyM,
      })
      .from(siteIgnores)
      .where(inArray(siteIgnores.observedSiteId, memberIds)),
    db
      .select({ id: observedCells.id, observedSiteId: observedCells.observedSiteId })
      .from(observedCells)
      .where(inArray(observedCells.observedSiteId, memberIds)),
  ]);
  const ignores = stored.map(({ latitude, longitude, ...ignore }) => ({
    ...ignore,
    point: latitude === null || longitude === null ? null : { latitude, longitude },
  }));
  const countryOfStale = new Map(
    ignoredGroups.flatMap((site) => staleIgnoreIds(site, ignores, memberCells).map((siteId): [number, string | null] => [siteId, site.countryCode])),
  );
  if (countryOfStale.size === 0) return false;

  await runAuditedOperation(systemAuditContext(), { kind: "observations.site_ignore" }, async (tx, audit) => {
    const lifted = await tx
      .delete(siteIgnores)
      .where(inArray(siteIgnores.observedSiteId, [...countryOfStale.keys()]))
      .returning();
    await audit.logMany(
      lifted.map((row) => ({
        entity: "site_ignores",
        op: "delete",
        recordId: row.observedSiteId,
        old: ignoreSnapshot(row, countryOfStale.get(row.observedSiteId) ?? null),
      })),
    );
  });
  return true;
}

function shownPositionOf(site: ObservedSiteRecord): Pick<SiteIgnoreRow, "point" | "uncertaintyM"> {
  const point = shownPoint(site);
  if (site.estimate === null || point === null) return { point: null, uncertaintyM: null };
  return { point: { x: point.longitude, y: point.latitude }, uncertaintyM: site.estimate.uncertaintyM };
}

function ignoresOf(site: ObservedSiteRecord, lockedCells: readonly LockedCell[], reason: string, actorId: string | null): NewIgnore[] {
  const cellsBySite = Map.groupBy(lockedCells, (cell) => cell.observedSiteId);
  const position = shownPositionOf(site);
  return membersOf(site).flatMap((observedSiteId) => {
    const observedCellIds = (cellsBySite.get(observedSiteId) ?? []).map((cell) => cell.id);
    return observedCellIds.length === 0 ? [] : [{ observedSiteId, ignoredById: actorId, reason, observedCellIds, ...position }];
  });
}

function isSameIgnore(stored: SiteIgnoreRow | undefined, wanted: NewIgnore): boolean {
  if (stored === undefined) return false;
  return (
    stored.reason === wanted.reason &&
    stored.uncertaintyM === wanted.uncertaintyM &&
    stored.point?.x === wanted.point?.x &&
    stored.point?.y === wanted.point?.y &&
    stored.observedCellIds.length === wanted.observedCellIds.length &&
    stored.observedCellIds.every((cellId) => wanted.observedCellIds.includes(cellId))
  );
}

export async function saveIgnores(
  audit: AuditRecorder,
  site: ObservedSiteRecord,
  lockedCells: readonly LockedCell[],
  { reason, actorId, stored }: { reason: string; actorId: string | null; stored: readonly SiteIgnoreRow[] },
): Promise<number> {
  const storedBySite = new Map(stored.map((ignore) => [ignore.observedSiteId, ignore]));
  const changed = ignoresOf(site, lockedCells, reason, actorId).filter((ignore) => !isSameIgnore(storedBySite.get(ignore.observedSiteId), ignore));
  if (changed.length === 0) return 0;

  const saved = await audit.tx
    .insert(siteIgnores)
    .values(changed)
    .onConflictDoUpdate({
      target: siteIgnores.observedSiteId,
      set: {
        ignoredById: sql`excluded.ignored_by_id`,
        reason: sql`excluded.reason`,
        ignoredAt: sql`now()`,
        observedCellIds: sql`excluded.observed_cell_ids`,
        point: sql`excluded.point`,
        uncertaintyM: sql`excluded.uncertainty_m`,
      },
    })
    .returning();
  await audit.logMany(
    saved.map((ignore) => {
      const old = storedBySite.get(ignore.observedSiteId);
      return {
        entity: "site_ignores",
        op: old === undefined ? "create" : "update",
        recordId: ignore.observedSiteId,
        old: old === undefined ? null : ignoreSnapshot(old, site.countryCode),
        new: ignoreSnapshot(ignore, site.countryCode),
      };
    }),
  );
  return saved.length;
}

export async function deleteIgnores(audit: AuditRecorder, siteIds: readonly number[], countryCode: string | null): Promise<number> {
  const deleted = await audit.tx
    .delete(siteIgnores)
    .where(inArray(siteIgnores.observedSiteId, [...siteIds]))
    .returning();
  await audit.logMany(
    deleted.map((ignore) => ({ entity: "site_ignores", op: "delete", recordId: ignore.observedSiteId, old: ignoreSnapshot(ignore, countryCode) })),
  );
  return deleted.length;
}

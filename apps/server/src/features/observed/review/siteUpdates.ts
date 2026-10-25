import { cellPlmns, cells, matchQueue, observedCells, plmns, siteIgnores, siteLinks, stations } from "@openbts/drizzle";
import type { AuditOperationKind } from "@openbts/shared/audit";
import type { ObservedSite, ObservedSiteConflict, ObservedSiteUpdate } from "@openbts/shared/contract";
import { type SQL, and, asc, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { DetailedErrorResponse, ErrorResponse, ValidationError } from "../../../errors.js";
import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { actorIdFromRequest } from "../../access/access.js";
import { defineScope } from "../../access/scope.js";
import { findNetworkOperators } from "../../analyzer/match.js";
import { type AuditRecorder, runAuditedOperation, standaloneAuditContext } from "../../audit/index.js";
import { findVisibleStation } from "../../stations/read.js";
import { assertObservationsOn } from "../access.js";
import { LOCKED_CELL_COLUMNS, type LockedCell } from "../cells/locks.js";
import { membersOf } from "../flags/sites/flaggedSite.js";
import { refreshSiteFlags } from "../flags/sites/pass.js";
import { linkSites, suggestStations } from "../sites/links.js";
import { markSitesDirty } from "../sites/moves.js";
import { type ObservedSiteRecord, loadObservedSites } from "../sites/read.js";
import { toObservedSite } from "../sites/serialize.js";
import { type SiteLinkRow, deleteHandLinks, saveHandLinks } from "./handLinks.js";
import { type SiteIgnoreRow, deleteIgnores, saveIgnores } from "./ignores.js";

type SiteChangeRequest = { Params: { id: number }; Body: ObservedSiteUpdate };

const COPY_MESSAGE = "A copy is changed through the site it copies";
const REPLACED_MESSAGE = "The site was replaced by other sites";
const STATION_SITE_MESSAGE = "The site holds the cells of a station in the database and belongs to it";
const UNKNOWN_STATION_MESSAGE = "No station you can see has this id";
const OTHER_NETWORK_MESSAGE = "The station's operator neither runs nor shares the site's network, and none of its cells broadcasts it";
const LINKED_STATION_FIELD = "handLink/stationId";

const siteBeforeChange = new WeakMap<FastifyRequest, Promise<ObservedSiteRecord | undefined>>();

function loadSiteBeforeChange(req: FastifyRequest<SiteChangeRequest>): Promise<ObservedSiteRecord | undefined> {
  const loaded = siteBeforeChange.get(req);
  if (loaded) return loaded;

  const pending = loadObservedSites([req.params.id]).then(([site]) => site);
  siteBeforeChange.set(req, pending);
  return pending;
}

export const observedSiteScope = defineScope<SiteChangeRequest>(async (req) => {
  const site = await loadSiteBeforeChange(req);
  if (site === undefined) throw new ErrorResponse("NOT_FOUND");

  const targets = [{ countryCode: site.countryCode, regionId: site.regionId }];
  const { handLink } = req.body;
  return handLink ? { targets, stationIds: [handLink.stationId] } : { targets };
});

function conflictOf(detail: ObservedSiteConflict, message: string): DetailedErrorResponse {
  return new DetailedErrorResponse("CONFLICT", [detail], { message });
}

function assertChangeable(site: ObservedSiteRecord | undefined): ObservedSiteRecord {
  if (site === undefined) throw new ErrorResponse("NOT_FOUND");
  if (site.copyOfObservedSiteId !== null) throw conflictOf({ kind: "copy", observedSiteId: site.copyOfObservedSiteId }, COPY_MESSAGE);
  if (site.retiredAt !== null) throw conflictOf({ kind: "replaced", replacedByObservedSiteIds: site.replacedByObservedSiteIds }, REPLACED_MESSAGE);
  if (site.stationId !== null) throw conflictOf({ kind: "stationSite", stationId: site.stationId }, STATION_SITE_MESSAGE);
  return site;
}

export async function loadSiteToChange(siteId: number): Promise<ObservedSiteRecord> {
  const [site] = await loadObservedSites([siteId]);
  return assertChangeable(site);
}

export async function carriesNetwork(plmn: string, operatorId: number | null, broadcastingStations: SQL): Promise<boolean> {
  const operatorIds = (await findNetworkOperators([plmn])).get(plmn) ?? [];
  if (operatorId !== null && operatorIds.includes(operatorId)) return true;

  const [broadcast] = await db
    .select({ cellId: cellPlmns.cellId })
    .from(cellPlmns)
    .innerJoin(plmns, eq(plmns.id, cellPlmns.plmnId))
    .innerJoin(cells, eq(cells.id, cellPlmns.cellId))
    .innerJoin(stations, eq(stations.id, cells.station_id))
    .where(and(eq(plmns.code, plmn), broadcastingStations))
    .limit(1);
  return broadcast !== undefined;
}

export async function lockSiteCells(tx: DbTx, siteIds: readonly number[]): Promise<LockedCell[]> {
  return tx
    .select(LOCKED_CELL_COLUMNS)
    .from(observedCells)
    .where(inArray(observedCells.observedSiteId, [...siteIds]))
    .orderBy(asc(observedCells.id))
    .for("key share");
}

export async function queueCells(tx: DbTx, lockedCells: readonly LockedCell[]): Promise<void> {
  if (lockedCells.length === 0) return;
  await tx
    .insert(matchQueue)
    .values(lockedCells.map((cell) => ({ observedCellId: cell.id })))
    .onConflictDoNothing();
}

async function assertLinkable(req: FastifyRequest, site: ObservedSiteRecord, stationId: number): Promise<void> {
  const station = await findVisibleStation(req, stationId).catch((error: unknown) => {
    if (error instanceof ErrorResponse && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (station === null) throw new DetailedErrorResponse("NOT_FOUND", [{ field: LINKED_STATION_FIELD }], { message: UNKNOWN_STATION_MESSAGE });
  if (!(await carriesNetwork(site.plmn, station.operator_id, eq(stations.id, stationId)))) {
    throw new ValidationError([{ field: LINKED_STATION_FIELD, validationMessage: OTHER_NETWORK_MESSAGE }]);
  }
}

function auditKindOf(change: ObservedSiteUpdate): AuditOperationKind {
  return change.ignore === undefined ? "observations.site_link" : "observations.site_ignore";
}

async function lockIgnoresAndLinks(tx: DbTx, siteIds: readonly number[]): Promise<{ ignores: SiteIgnoreRow[]; links: SiteLinkRow[] }> {
  const [ignores, links] = await Promise.all([
    tx
      .select()
      .from(siteIgnores)
      .where(inArray(siteIgnores.observedSiteId, [...siteIds]))
      .orderBy(asc(siteIgnores.observedSiteId))
      .for("update"),
    tx
      .select()
      .from(siteLinks)
      .where(inArray(siteLinks.observedSiteId, [...siteIds]))
      .orderBy(asc(siteLinks.observedSiteId))
      .for("update"),
  ]);
  return { ignores, links };
}

async function writeChange(audit: AuditRecorder, site: ObservedSiteRecord, change: ObservedSiteUpdate, actorId: string | null): Promise<void> {
  const { tx } = audit;
  const siteIds = membersOf(site);
  const lockedCells = await lockSiteCells(tx, siteIds);
  const stored = await lockIgnoresAndLinks(tx, siteIds);

  let changedLinks = 0;
  let changedIgnores = 0;
  if (change.handLink) {
    changedLinks = await saveHandLinks(audit, siteIds, change.handLink.stationId, stored.links, actorId);
    changedIgnores = await deleteIgnores(audit, siteIds, site.countryCode);
  } else if (change.handLink === null) {
    changedLinks = await deleteHandLinks(audit, siteIds);
  } else if (change.ignore) {
    changedLinks = await deleteHandLinks(audit, siteIds);
    changedIgnores = await saveIgnores(audit, site, lockedCells, { reason: change.ignore.reason, actorId, stored: stored.ignores });
  } else {
    changedIgnores = await deleteIgnores(audit, siteIds, site.countryCode);
  }

  if (!change.handLink && changedLinks > 0) {
    await linkSites(tx, siteIds);
    await suggestStations(tx, lockedCells);
  }
  if (changedIgnores + changedLinks === 0) return;

  await queueCells(tx, lockedCells);
  if (changedLinks > 0) await markSitesDirty(tx, siteIds);
}

export async function updateObservedSite(req: FastifyRequest<SiteChangeRequest>): Promise<ObservedSite> {
  const change = req.body;
  await assertObservationsOn(req);
  const site = assertChangeable(await loadSiteBeforeChange(req));
  if (change.handLink) await assertLinkable(req, site, change.handLink.stationId);

  const actorId = actorIdFromRequest(req);
  await runAuditedOperation(standaloneAuditContext(req), { kind: auditKindOf(change) }, (_tx, audit) => writeChange(audit, site, change, actorId));
  await refreshSiteFlags(membersOf(site), actorId).catch((error: unknown) =>
    logger.error("observations.site_update.flags", { siteId: site.id, error }),
  );

  const [updated] = await loadObservedSites([site.id]);
  if (updated === undefined) throw new ErrorResponse("NOT_FOUND");
  return toObservedSite(updated);
}

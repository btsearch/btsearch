import { observationFlags, observedSites, siteLinks, stationOrigins, stations } from "@openbts/drizzle";
import type { ObservationFlagKind, ObservedSiteStationConflict, StationCreate } from "@openbts/shared/contract";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../../database/psql.js";
import { DetailedErrorResponse, ErrorResponse, ValidationError } from "../../../errors.js";
import type { DbClient, DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { actorIdFromRequest } from "../../access/access.js";
import { defineScope } from "../../access/scope.js";
import { applyStationChange, stationCreateScope, toStationCreateEdit } from "../../stations/edit.js";
import { assertObservationsOn } from "../access.js";
import type { LockedCell } from "../cells/locks.js";
import { matchCellsNow } from "../cells/matching.js";
import { closeAppliedFlags } from "../flags/applied.js";
import { membersOf, metersBetween } from "../flags/sites/flaggedSite.js";
import { refreshSiteFlags } from "../flags/sites/pass.js";
import type { ObservedSiteRecord } from "../sites/read.js";
import type { Point } from "../tiles/squares.js";
import { loadCandidates } from "./evidence.js";
import { deleteIgnores } from "./ignores.js";
import { carriesNetwork, loadSiteToChange, lockSiteCells, queueCells } from "./siteUpdates.js";

const stationOriginSelectSchema = createSelectSchema(stationOrigins);

type CoordinatesFrom = z.infer<typeof stationOriginSelectSchema>["coordinatesFrom"];

const SAME_PLACE_M = 10;
const RESOLVED_FLAG_KINDS = ["unmatchedSite", "positionShifts"] as const satisfies readonly ObservationFlagKind[];

const MATCHED_MESSAGE = "The site is matched to a station already";
const MADE_MESSAGE = "A station was made from this site already";
const LOCATION_MESSAGE = "A station made from an estimated site needs a location";
const OTHER_OPERATOR_MESSAGE = "The operator neither runs nor shares the site's network, and none of its stations broadcasts it";

export const stationFromSiteScope = defineScope<{ Params: { id: number }; Body: StationCreate }>(async (req) => {
  const [site] = await db.select({ id: observedSites.id }).from(observedSites).where(eq(observedSites.id, req.params.id)).limit(1);
  if (site === undefined) throw new ErrorResponse("NOT_FOUND");
  return stationCreateScope(req.body);
});

function isSamePlace(a: Point, b: Point): boolean {
  return metersBetween(a, b) <= SAME_PLACE_M;
}

async function coordinatesFromOf(site: ObservedSiteRecord, leadSiteId: number, location: Point): Promise<CoordinatesFrom> {
  const tested = await loadCandidates(leadSiteId, site.algorithmVersion);
  if (tested.some((place) => isSamePlace(place, location))) return "snapped";

  const { estimate } = site;
  const fitted = estimate === null ? [] : [estimate, ...(estimate.alternative === null ? [] : [estimate.alternative])];
  return fitted.some((place) => isSamePlace(place, location)) ? "estimate" : "editor";
}

async function findOpenSiteFlagIds(siteIds: readonly number[]): Promise<number[]> {
  const flags = await db
    .select({ id: observationFlags.id })
    .from(observationFlags)
    .where(
      and(
        inArray(observationFlags.kind, [...RESOLVED_FLAG_KINDS]),
        inArray(observationFlags.observedSiteId, [...siteIds]),
        isNull(observationFlags.closedReason),
      ),
    )
    .orderBy(asc(observationFlags.id));
  return flags.map((flag) => flag.id);
}

async function lockStillOpenFlags(tx: DbTx, flagIds: readonly number[]) {
  if (flagIds.length === 0) return [];
  return tx
    .select({ id: observationFlags.id, observedCellId: observationFlags.observedCellId, observedSiteId: observationFlags.observedSiteId })
    .from(observationFlags)
    .where(and(inArray(observationFlags.id, [...flagIds]), isNull(observationFlags.closedReason)))
    .orderBy(asc(observationFlags.id))
    .for("update");
}

function stationExists(kind: "madeFromSite" | "matched", stationId: number, message: string): DetailedErrorResponse {
  const detail: ObservedSiteStationConflict = { kind, stationId };
  return new DetailedErrorResponse("CONFLICT", [detail], { message });
}

async function assertNoStationYet(client: DbClient, siteIds: readonly number[]): Promise<void> {
  const [[origin], [link]] = await Promise.all([
    client
      .select({ stationId: stationOrigins.stationId })
      .from(stationOrigins)
      .innerJoin(stations, eq(stations.id, stationOrigins.stationId))
      .where(and(inArray(stationOrigins.observedSiteId, [...siteIds]), ne(stations.status, "inactive")))
      .orderBy(asc(stationOrigins.stationId))
      .limit(1),
    client
      .select({ stationId: siteLinks.stationId })
      .from(siteLinks)
      .where(and(inArray(siteLinks.observedSiteId, [...siteIds]), eq(siteLinks.kind, "matched")))
      .orderBy(asc(siteLinks.observedSiteId))
      .limit(1),
  ]);
  if (origin !== undefined) throw stationExists("madeFromSite", origin.stationId, MADE_MESSAGE);
  if (link !== undefined) throw stationExists("matched", link.stationId, MATCHED_MESSAGE);
}

async function lockSites(tx: DbTx, siteIds: readonly number[]): Promise<void> {
  await tx
    .select({ id: observedSites.id })
    .from(observedSites)
    .where(inArray(observedSites.id, [...siteIds]))
    .orderBy(asc(observedSites.id))
    .for("no key update");
}

async function assertBodyFitsSite(site: ObservedSiteRecord, { station, location }: StationCreate): Promise<Point> {
  if (location === undefined) throw new ValidationError([{ field: "location", validationMessage: LOCATION_MESSAGE }]);
  if (!(await carriesNetwork(site.plmn, station.operatorId, eq(stations.operator_id, station.operatorId)))) {
    throw new ValidationError([{ field: "station/operatorId", validationMessage: OTHER_OPERATOR_MESSAGE }]);
  }
  return location;
}

export async function createStationFromSite(req: FastifyRequest, siteId: number, body: StationCreate): Promise<number> {
  await assertObservationsOn(req);
  const site = await loadSiteToChange(siteId);
  const location = await assertBodyFitsSite(site, body);
  const siteIds = membersOf(site);
  const leadSiteId = site.group?.leadSiteId ?? site.id;
  const [, coordinatesFrom, flagIds] = await Promise.all([
    assertNoStationYet(db, siteIds),
    coordinatesFromOf(site, leadSiteId, location),
    findOpenSiteFlagIds(siteIds),
  ]);
  const metadata = { observed_site_id: leadSiteId, ...(flagIds.length > 0 ? { observation_flag_ids: flagIds } : {}) };
  const actorId = actorIdFromRequest(req);

  let lockedCells: LockedCell[] = [];
  const applied = await applyStationChange(req, toStationCreateEdit(body), "station.create", {
    metadata,
    beforeChange: async ({ tx }) => {
      lockedCells = await lockSiteCells(tx, siteIds);
      await lockSites(tx, siteIds);
      await assertNoStationYet(tx, siteIds);
    },
    afterChange: async (audit, { stationId }) => {
      if (stationId === null) throw new ErrorResponse("FAILED_TO_CREATE");

      const { tx } = audit;
      await tx.insert(stationOrigins).values({ stationId, observedSiteId: leadSiteId, coordinatesFrom });
      await closeAppliedFlags(tx, await lockStillOpenFlags(tx, flagIds), actorId, stationId);
      await deleteIgnores(audit, siteIds, site.countryCode);
      await queueCells(tx, lockedCells);
    },
  });
  const { stationId } = applied;
  if (stationId === null) throw new ErrorResponse("FAILED_TO_CREATE");

  const queuedCellIds = lockedCells.map((cell) => cell.id);
  if (queuedCellIds.length > 0) {
    await matchCellsNow(queuedCellIds).catch((error: unknown) => logger.error("observations.site_station.match", { siteId, stationId, error }));
  }
  await refreshSiteFlags(siteIds, actorId).catch((error: unknown) => logger.error("observations.site_station.flags", { siteIds, stationId, error }));
  return stationId;
}

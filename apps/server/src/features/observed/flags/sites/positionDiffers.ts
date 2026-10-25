import { locations, observationFlags, stations } from "@openbts/drizzle";
import { type SQL, and, eq, exists, gt } from "drizzle-orm";

import db from "../../../../database/psql.js";
import type { ObservedSiteRecord } from "../../sites/read.js";
import type { Point } from "../../tiles/squares.js";
import type { RaisedFlag } from "../kinds.js";
import { observedSiteSubject } from "../subjects.js";
import { isFlagSubject, metersBetween, siteMeasureOf } from "./flaggedSite.js";

const CLEAR_RADIUS_M = 300;
const DIFFERS_BY_RADII = 3;
const DIFFERS_BY_M = 300;

export function raisePositionDiffersFlag(site: ObservedSiteRecord, station: Point | null): RaisedFlag<"positionDiffers"> | null {
  const { estimate, matchedStationId } = site;
  if (!isFlagSubject(site) || site.status !== "matched" || matchedStationId === null || !site.isConfirmed || station === null) return null;
  if (estimate === null || estimate.of !== "site" || !estimate.isConsistent || estimate.uncertaintyM >= CLEAR_RADIUS_M) return null;

  const distance = metersBetween(estimate, station);
  if (distance <= Math.max(DIFFERS_BY_RADII * estimate.uncertaintyM, DIFFERS_BY_M)) return null;
  return {
    kind: "positionDiffers",
    subjectKey: observedSiteSubject(site),
    refs: { observedSiteId: site.id, stationId: matchedStationId },
    evidence: { distanceMeters: Math.round(distance), radiusMeters: estimate.uncertaintyM },
    suggestion: null,
    measure: siteMeasureOf(site, estimate),
  };
}

export function stationMovedSinceFlag(): SQL {
  const moved = db
    .select({ id: stations.id })
    .from(stations)
    .innerJoin(locations, eq(locations.id, stations.location_id))
    .where(and(eq(stations.id, observationFlags.stationId), gt(locations.updatedAt, observationFlags.updatedAt)));
  return exists(moved);
}

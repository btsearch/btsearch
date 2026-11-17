import { crowdSettings, siteEstimates } from "@openbts/drizzle";
import { and, eq, inArray } from "drizzle-orm";

import type { DbTx } from "../../../types/global.js";
import type { Point } from "../tiles/squares.js";
import { SETTINGS_ROW_ID } from "./select.js";

type EstimatePoint = { point: Point; isConsistent: boolean };

export async function loadEstimatePoints(tx: DbTx, siteIds: readonly number[]): Promise<Map<number, EstimatePoint>> {
  if (siteIds.length === 0) return new Map();

  const estimates = await tx
    .select({ observedSiteId: siteEstimates.observedSiteId, point: siteEstimates.point, isConsistent: siteEstimates.isConsistent })
    .from(siteEstimates)
    .innerJoin(crowdSettings, and(eq(crowdSettings.id, SETTINGS_ROW_ID), eq(crowdSettings.publishedAlgorithmVersion, siteEstimates.algorithmVersion)))
    .where(inArray(siteEstimates.observedSiteId, [...siteIds]));
  return new Map(
    estimates.map(({ observedSiteId, point, isConsistent }) => [observedSiteId, { point: { latitude: point.y, longitude: point.x }, isConsistent }]),
  );
}

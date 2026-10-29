import { officialLocations, officialPermits, officialSites } from "@openbts/drizzle";
import { eq, sql } from "drizzle-orm";

import { idsIn } from "../../../../lib/conditions.js";
import type { DbTx } from "../../../../types/global.js";
import { buildMapLocationActionUrl, buildOfficialSiteActionUrl } from "../../../notifications/actionUrls.js";
import { notifyOfficialSitesWatchers } from "../../../notifications/service.js";
import { getWatchedOfficialSiteIds } from "../../../notifications/watchers.js";
import { readEveryChange } from "../changes.js";
import type { AfterStep, AfterStepContext } from "../types.js";
import { notifyInPages } from "./notificationPages.js";
import { SITE_CHANGE_KINDS, type SiteChangeSummary, summarizeSiteChanges } from "./siteChanges.js";

type SiteNotification = Parameters<typeof notifyOfficialSitesWatchers>[0][number];

export type StoredSite = { id: number; siteCode: string | null; latitude: number; longitude: number; hasPermits: boolean };

export function siteNotificationOf(summary: SiteChangeSummary, site: StoredSite): SiteNotification | null {
  const permitsAdded = summary.permitsAdded;
  const permitsDeleted = summary.permitsArchived;
  const sitesAdded = summary.wasAdded && site.hasPermits ? 1 : 0;
  const count = permitsAdded + permitsDeleted + sitesAdded;
  if (count === 0) return null;

  const siteDeleted = permitsDeleted > 0 && !site.hasPermits;
  const location = { latitude: site.latitude, longitude: site.longitude };

  return {
    officialSiteId: site.id,
    stationStringId: site.siteCode,
    type: "station_official_permit_added",
    siteDeleted,
    metadata: {
      permits_added: permitsAdded,
      permits_deleted: permitsDeleted,
      official_sites_added: sitesAdded,
      ...(siteDeleted ? { official_site_deleted: true } : {}),
      count,
    },
    actionUrl: siteDeleted ? buildMapLocationActionUrl(location) : buildOfficialSiteActionUrl({ id: site.id, location }),
  };
}

async function readSites(tx: DbTx, officialSiteIds: readonly number[]): Promise<Map<number, StoredSite>> {
  const sites = await tx
    .select({
      id: officialSites.id,
      siteCode: officialSites.station_id,
      latitude: officialLocations.latitude,
      longitude: officialLocations.longitude,
      hasPermits: sql<boolean>`EXISTS (SELECT 1 FROM ${officialPermits} WHERE ${officialPermits.official_site_id} = ${officialSites.id})`,
    })
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .where(sql`${officialSites.id} IN ${idsIn(officialSiteIds)}`);
  return new Map(sites.map((site) => [site.id, site]));
}

async function notifySites(tx: DbTx, summaries: readonly SiteChangeSummary[]): Promise<void> {
  const sites = await readSites(
    tx,
    summaries.map((summary) => summary.officialSiteId),
  );
  const notifications = summaries.flatMap((summary) => {
    const site = sites.get(summary.officialSiteId);
    const notification = site ? siteNotificationOf(summary, site) : null;
    return notification ? [notification] : [];
  });
  await notifyOfficialSitesWatchers(notifications, tx);
}

async function perform(context: AfterStepContext): Promise<void> {
  const changes = await context.transaction(async (tx) => {
    const watchedSiteIds = await getWatchedOfficialSiteIds(tx);
    return watchedSiteIds.length === 0 ? [] : readEveryChange(tx, context.run.id, SITE_CHANGE_KINDS, idsIn(watchedSiteIds));
  });
  await notifyInPages(context, summarizeSiteChanges(changes), notifySites);
}

export const siteNotifications: AfterStep = { name: "site_notifications", runsInDryRun: false, perform };

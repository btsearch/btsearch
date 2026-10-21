import { officialSiteWatches, stationWatches, userLists } from "@openbts/drizzle";
import { type SQL, and, eq, inArray, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import type { DbTx } from "../../types/global.js";

type Watch = { watchedId: number; userId: string };
type WatchReader = Pick<DbTx, "select" | "execute">;

export async function getStationWatchers(stationId: number): Promise<string[]> {
  const stationIdsJson = JSON.stringify([stationId]);
  const listContainsStation = sql`coalesce(${userLists.stations}->'internal', '[]'::jsonb) @> ${stationIdsJson}::jsonb`;

  const [directWatches, listWatches] = await Promise.all([
    db.select({ userId: stationWatches.userId }).from(stationWatches).where(eq(stationWatches.stationId, stationId)),
    db
      .select({ userId: userLists.created_by })
      .from(userLists)
      .where(and(eq(userLists.notificationsEnabled, true), listContainsStation)),
  ]);

  return [...new Set([...directWatches.map((watch) => watch.userId), ...listWatches.map((watch) => watch.userId)])];
}

async function readListWatches(watchedIds: readonly number[], listedIds: SQL, reader: WatchReader): Promise<Watch[]> {
  return reader.execute<Watch>(sql`
      SELECT watched.id::integer AS "watchedId", list.created_by AS "userId"
      FROM jsonb_array_elements_text(${JSON.stringify(watchedIds)}::jsonb) AS watched (id)
      JOIN ${userLists} AS list ON coalesce(${listedIds}, '[]'::jsonb) @> jsonb_build_array(watched.id::integer)
      WHERE list.notifications_enabled = true
    `);
}

function watchersById(watches: readonly Watch[]): Map<number, string[]> {
  const watchesById = Map.groupBy(watches, (watch) => watch.watchedId);
  return new Map([...watchesById].map(([watchedId, watchesOfId]) => [watchedId, unique(watchesOfId.map((watch) => watch.userId))]));
}

export async function getStationsWatchers(stationIds: readonly number[], reader: WatchReader): Promise<Map<number, string[]>> {
  const [directWatches, listWatches] = await Promise.all([
    reader
      .select({ watchedId: stationWatches.stationId, userId: stationWatches.userId })
      .from(stationWatches)
      .where(inArray(stationWatches.stationId, [...stationIds])),
    readListWatches(stationIds, sql`list.stations->'internal'`, reader),
  ]);
  return watchersById([...directWatches, ...listWatches]);
}

export async function getWatchedOfficialSiteIds(reader: WatchReader): Promise<number[]> {
  const [directWatches, listedSites] = await Promise.all([
    reader.select({ id: officialSiteWatches.officialSiteId }).from(officialSiteWatches),
    reader
      .select({ id: sql<number>`jsonb_array_elements_text(coalesce(${userLists.stations}->'official', '[]'::jsonb))::integer` })
      .from(userLists)
      .where(eq(userLists.notificationsEnabled, true)),
  ]);
  return unique([...directWatches, ...listedSites].map((site) => site.id));
}

export async function getOfficialSitesWatchers(siteIds: readonly number[], reader: WatchReader): Promise<Map<number, string[]>> {
  const [directWatches, listWatches] = await Promise.all([
    reader
      .select({ watchedId: officialSiteWatches.officialSiteId, userId: officialSiteWatches.userId })
      .from(officialSiteWatches)
      .where(inArray(officialSiteWatches.officialSiteId, [...siteIds])),
    readListWatches(siteIds, sql`list.stations->'official'`, reader),
  ]);
  return watchersById([...directWatches, ...listWatches]);
}

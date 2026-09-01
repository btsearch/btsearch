import { stationWatches, userLists } from "@openbts/drizzle";
import { and, eq, sql } from "drizzle-orm";

import db from "../../database/psql.js";

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

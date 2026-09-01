import { ukeStationWatches, userLists } from "@openbts/drizzle";
import { and, eq, sql } from "drizzle-orm";

import db from "../../database/psql.js";

export async function getUkeStationWatchers(ukeStationId: number): Promise<string[]> {
  const stationIdsJson = JSON.stringify([ukeStationId]);
  const listContainsStation = sql`coalesce(${userLists.stations}->'uke', '[]'::jsonb) @> ${stationIdsJson}::jsonb`;

  const [directWatches, listWatches] = await Promise.all([
    db.select({ userId: ukeStationWatches.userId }).from(ukeStationWatches).where(eq(ukeStationWatches.ukeStationId, ukeStationId)),
    db
      .select({ userId: userLists.created_by })
      .from(userLists)
      .where(and(eq(userLists.notificationsEnabled, true), listContainsStation)),
  ]);

  return [...new Set([...directWatches.map((watch) => watch.userId), ...listWatches.map((watch) => watch.userId)])];
}

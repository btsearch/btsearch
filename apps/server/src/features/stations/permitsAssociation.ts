import { stationsPermits, ukeLocations, ukePermits, ukeStations } from "@openbts/drizzle";
import { associateStationsWithPermits } from "@openbts/uke-importer/stations";
import { sql } from "drizzle-orm";
import { eq, notExists } from "drizzle-orm/sql/expressions/conditions";

import db from "../../database/psql.js";

export async function pruneStationsPermits(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE ${stationsPermits} RESTART IDENTITY;`);
}

export async function rebuildStationsPermitsAssociations(): Promise<void> {
  await pruneStationsPermits();
  await associateStationsWithPermits();
}

export async function syncStationsPermitsAssociations(): Promise<void> {
  await associateStationsWithPermits();
}

export async function cleanupOrphanedUkeStations(): Promise<void> {
  await db
    .delete(ukeStations)
    .where(notExists(db.select({ id: ukePermits.id }).from(ukePermits).where(eq(ukePermits.uke_station_id, ukeStations.id))));
}

export async function cleanupOrphanedUkeLocations(): Promise<void> {
  await db
    .delete(ukeLocations)
    .where(notExists(db.select({ id: ukeStations.id }).from(ukeStations).where(eq(ukeStations.location_id, ukeLocations.id))));
}

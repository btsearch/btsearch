import { auditLogs } from "@openbts/drizzle";
import { AUDIT_ENTITIES, type AuditEntity } from "@openbts/shared/audit";
import { type SQL, and, eq, gte, inArray, or } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

import type { StationRow } from "./serialize.js";

const auditLogSelectSchema = createSelectSchema(auditLogs, {
  entity: z.enum(AUDIT_ENTITIES),
  old_values: z.unknown(),
  new_values: z.unknown(),
  metadata: z.unknown(),
});

export type AuditRow = z.infer<typeof auditLogSelectSchema>;
export type HistoryStation = Pick<StationRow, "id" | "location_id" | "createdAt">;

const HISTORY_ENTITIES: readonly AuditEntity[] = [
  "stations",
  "locations",
  "cells",
  "station_sectors",
  "extra_identificators",
  "station_uplinks",
  "station_photo_selections",
];

export function stationEntryCondition(station: HistoryStation): SQL | undefined {
  const directEntry = and(inArray(auditLogs.entity, HISTORY_ENTITIES), eq(auditLogs.station_id, station.id));
  if (station.location_id === null) return directEntry;

  const locationEntry = and(
    eq(auditLogs.entity, "locations"),
    eq(auditLogs.record_id, String(station.location_id)),
    gte(auditLogs.createdAt, station.createdAt),
  );
  return or(directEntry, locationEntry);
}

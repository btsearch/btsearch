import { locations, stations } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { type ScopeRefs, locationRefs } from "../access/scope.js";
import { auditContextFromRequest, runAuditedOperation } from "../audit/index.js";
import { findRegionIdAt } from "../regions/lookup.js";
import { assertOwnerFitsAfterWrite } from "./structure.js";

const locationSelectSchema = createSelectSchema(locations);
const locationInsertSchema = createInsertSchema(locations);

export type LocationRow = z.infer<typeof locationSelectSchema>;
type LocationInsert = z.infer<typeof locationInsertSchema>;

export type NewLocation = Omit<LocationInsert, "region_id"> & { region_id?: number };
export type LocationPatch = Partial<LocationInsert>;

const NO_REGION_MESSAGE = "No region could be worked out for these coordinates, send regionId";

function movesOrRefiles({ region_id, longitude, latitude }: LocationPatch): boolean {
  return region_id !== undefined || longitude !== undefined || latitude !== undefined;
}

async function filedRegionId(patch: LocationPatch, current: LocationRow): Promise<number | undefined> {
  if (!movesOrRefiles(patch)) return undefined;

  const regionId = patch.region_id ?? current.region_id;
  const found = await findRegionIdAt({ longitude: patch.longitude ?? current.longitude, latitude: patch.latitude ?? current.latitude, regionId });
  const filed = found ?? regionId;
  return patch.region_id === undefined && filed === current.region_id ? undefined : filed;
}

export async function findOrCreateLocation(req: FastifyRequest, values: NewLocation): Promise<{ location: LocationRow; isNew: boolean }> {
  const { longitude, latitude, region_id: claimedRegionId } = values;

  const existing = await db.query.locations.findFirst({ where: { AND: [{ longitude }, { latitude }] } });
  if (existing) return { location: existing, isNew: false };

  const regionId = (await findRegionIdAt({ longitude, latitude, regionId: claimedRegionId })) ?? claimedRegionId;
  if (regionId === undefined) throw new ErrorResponse("BAD_REQUEST", { message: NO_REGION_MESSAGE });

  const location = await runAuditedOperation(auditContextFromRequest(req), { kind: "location.create" }, async (tx, audit) => {
    await assertOwnerFitsAfterWrite(tx, null, { region_id: regionId, structure_owner_id: values.structure_owner_id });
    const [created] = await tx
      .insert(locations)
      .values({ ...values, region_id: regionId })
      .returning();
    if (!created) throw new ErrorResponse("FAILED_TO_CREATE");

    await audit.log({ entity: "locations", op: "create", recordId: created.id, new: created });
    return created;
  });
  return { location, isNew: true };
}

export async function updateLocation(req: FastifyRequest, id: number, patch: LocationPatch): Promise<LocationRow> {
  const location = await db.query.locations.findFirst({ where: { id } });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  const linkedStations = await db.query.stations.findMany({ where: { location_id: id }, columns: { id: true } });
  const stationIds = linkedStations.map((station) => station.id);

  return runAuditedOperation(auditContextFromRequest(req), { kind: "location.edit", metadata: { station_ids: stationIds } }, async (tx, audit) => {
    const oldLocation = await tx.query.locations.findFirst({ where: { id } });
    if (!oldLocation) throw new ErrorResponse("NOT_FOUND");

    const longitude = patch.longitude ?? oldLocation.longitude;
    const latitude = patch.latitude ?? oldLocation.latitude;
    if (longitude !== oldLocation.longitude || latitude !== oldLocation.latitude) {
      const [taken] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.longitude, longitude), eq(locations.latitude, latitude), ne(locations.id, id)))
        .limit(1);
      if (taken) throw new ErrorResponse("CONFLICT", { message: "Another location already has these coordinates" });
    }

    const regionId = await filedRegionId(patch, oldLocation);
    await assertOwnerFitsAfterWrite(tx, oldLocation, { region_id: regionId ?? oldLocation.region_id, structure_owner_id: patch.structure_owner_id });
    const changes = { ...patch, updatedAt: new Date() };
    if (regionId !== undefined) changes.region_id = regionId;
    const [nextLocation] = await tx.update(locations).set(changes).where(eq(locations.id, id)).returning();
    if (!nextLocation) throw new ErrorResponse("FAILED_TO_UPDATE");

    await audit.log({ entity: "locations", op: "update", recordId: id, old: oldLocation, new: nextLocation });
    if (stationIds.length > 0) await tx.update(stations).set({ updatedAt: new Date() }).where(eq(stations.location_id, id));
    return nextLocation;
  });
}

export async function locationUpdateScope(id: number, patch: LocationPatch): Promise<ScopeRefs> {
  if (!movesOrRefiles(patch)) return { locationIds: [id] };

  const current = await db.query.locations.findFirst({ where: { id }, columns: { region_id: true, longitude: true, latitude: true } });
  return { locationIds: [id], ...locationRefs(patch, current) };
}

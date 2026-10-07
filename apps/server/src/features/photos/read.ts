import { attachments, locationPhotos, locations, regions, stationPhotoSelections, stations, structureOwners, users } from "@openbts/drizzle";
import type { Photo, PhotoInclude, PhotoSelection, Station, StationLocation, photoDetailsShape } from "@openbts/shared/contract";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { locationColumns, serializeStations } from "../stations/read.js";
import { toStationLocation } from "../stations/serialize.js";
import { type UserRefViewer, toPublicUserRef } from "../users/userRef.js";

const locationPhotoSelectSchema = createSelectSchema(locationPhotos);

export type LocationPhotoRow = z.infer<typeof locationPhotoSelectSchema>;

export const photoColumns = {
  locationPhotoId: locationPhotos.id,
  fileId: attachments.uuid,
  locationId: locationPhotos.location_id,
  width: attachments.width,
  height: attachments.height,
  hasThumb: attachments.has_thumb,
  hasFull: attachments.has_full,
  note: locationPhotos.note,
  takenAt: locationPhotos.taken_at,
  createdAt: locationPhotos.createdAt,
  authorId: users.id,
  authorUsername: users.username,
  authorName: users.name,
  authorImage: users.image,
  authorVisibility: users.profileVisibility,
};

export type PhotoRow = {
  locationPhotoId: number;
  fileId: string;
  locationId: number;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
  hasFull: boolean;
  note: string | null;
  takenAt: Date | null;
  createdAt: Date;
  authorId: string | null;
  authorUsername: string | null;
  authorName: string | null;
  authorImage: string | null;
  authorVisibility: string | null;
};

type PhotoAuthorRow = Pick<PhotoRow, "authorId" | "authorUsername" | "authorName" | "authorImage" | "authorVisibility">;
type PhotoDetailsRow = PhotoAuthorRow & Pick<PhotoRow, "width" | "height" | "note" | "takenAt" | "createdAt">;
type PhotoDetails = Pick<Photo, keyof typeof photoDetailsShape>;

export function photoUrls(fileId: string, hasThumb: boolean, hasFull: boolean): Photo["urls"] {
  const display = `/uploads/${fileId}.webp`;
  return {
    thumb: hasThumb ? `/uploads/${fileId}.thumb.webp` : display,
    display,
    full: hasFull ? `/uploads/${fileId}.full.avif` : display,
  };
}

function toPhotoAuthor(row: PhotoAuthorRow, viewer: UserRefViewer): Photo["author"] {
  if (row.authorId === null) return null;

  return toPublicUserRef(
    {
      id: row.authorId,
      username: row.authorUsername,
      name: row.authorName,
      image: row.authorImage,
      profileVisibility: row.authorVisibility ?? "private",
    },
    viewer,
  );
}

export function toPhotoDetails(row: PhotoDetailsRow, viewer: UserRefViewer): PhotoDetails {
  return {
    width: row.width,
    height: row.height,
    note: row.note,
    takenAt: row.takenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    author: toPhotoAuthor(row, viewer),
  };
}

function selectPhotos() {
  return db
    .select(photoColumns)
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .leftJoin(users, eq(locationPhotos.uploaded_by, users.id));
}

export async function loadLocationPhotoRows(locationId: number): Promise<PhotoRow[]> {
  return await selectPhotos().where(eq(locationPhotos.location_id, locationId)).orderBy(desc(locationPhotos.createdAt), desc(locationPhotos.id));
}

export async function loadStationPhotoRows(stationId: number): Promise<PhotoRow[]> {
  return await db
    .select(photoColumns)
    .from(stationPhotoSelections)
    .innerJoin(locationPhotos, eq(stationPhotoSelections.location_photo_id, locationPhotos.id))
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .leftJoin(users, eq(locationPhotos.uploaded_by, users.id))
    .where(eq(stationPhotoSelections.station_id, stationId))
    .orderBy(desc(stationPhotoSelections.is_main), asc(locationPhotos.createdAt), asc(locationPhotos.id));
}

export async function loadPhotoRowsByIds(locationPhotoIds: readonly number[]): Promise<PhotoRow[]> {
  if (locationPhotoIds.length === 0) return [];
  return await selectPhotos()
    .where(inArray(locationPhotos.id, [...locationPhotoIds]))
    .orderBy(asc(locationPhotos.id));
}

export async function findLocationPhoto(locationId: number, fileId: string): Promise<LocationPhotoRow | undefined> {
  const [row] = await db
    .select({ photo: locationPhotos })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .where(and(eq(locationPhotos.location_id, locationId), eq(attachments.uuid, fileId)))
    .limit(1);
  return row?.photo;
}

export async function findLocationPhotoIds(fileId: string): Promise<number[]> {
  const rows = await db
    .select({ id: locationPhotos.id })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .where(eq(attachments.uuid, fileId));
  return rows.map((row) => row.id);
}

async function loadSelectionStations(stationIds: readonly number[]): Promise<Map<number, Station>> {
  if (stationIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(stations)
    .where(inArray(stations.id, [...stationIds]));
  return new Map((await serializeStations(rows)).map((station) => [station.id, station]));
}

async function loadPhotoLocations(locationIds: readonly number[]): Promise<Map<number, StationLocation>> {
  if (locationIds.length === 0) return new Map();

  const rows = await db
    .select({ location: locationColumns, region: regions, owner: structureOwners })
    .from(locations)
    .innerJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(structureOwners, eq(structureOwners.id, locations.structure_owner_id))
    .where(inArray(locations.id, [...locationIds]));
  return new Map(rows.map((row) => [row.location.id, toStationLocation(row.location, row.region.countryCode, row.owner)]));
}

export async function serializePhotos(rows: readonly PhotoRow[], viewer: UserRefViewer, include: readonly PhotoInclude[] = []): Promise<Photo[]> {
  if (rows.length === 0) return [];

  const selectionRows = await db
    .select({
      locationPhotoId: stationPhotoSelections.location_photo_id,
      stationId: stationPhotoSelections.station_id,
      isMain: stationPhotoSelections.is_main,
    })
    .from(stationPhotoSelections)
    .where(
      inArray(
        stationPhotoSelections.location_photo_id,
        rows.map((row) => row.locationPhotoId),
      ),
    )
    .orderBy(asc(stationPhotoSelections.id));

  const [stationsById, locationsById] = await Promise.all([
    include.includes("selections.station") ? loadSelectionStations([...new Set(selectionRows.map((row) => row.stationId))]) : null,
    include.includes("location") ? loadPhotoLocations([...new Set(rows.map((row) => row.locationId))]) : null,
  ]);

  const selectionsByPhoto = Map.groupBy(selectionRows, (row) => row.locationPhotoId);

  return rows.map((row) => {
    const selections = (selectionsByPhoto.get(row.locationPhotoId) ?? []).map(({ stationId, isMain }) => {
      const selection: PhotoSelection = { stationId, isMain };
      const station = stationsById?.get(stationId);
      if (station) selection.station = station;
      return selection;
    });
    const photo: Photo = {
      id: row.fileId,
      locationId: row.locationId,
      urls: photoUrls(row.fileId, row.hasThumb, row.hasFull),
      ...toPhotoDetails(row, viewer),
      selections,
    };
    const location = locationsById?.get(row.locationId);
    if (location) photo.location = location;
    return photo;
  });
}

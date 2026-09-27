import { attachments, locationPhotos, stationPhotoSelections, users } from "@openbts/drizzle";
import { asc, desc, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { type PhotoFileFields, photoFileColumns, photoFileFields, photoFileShape } from "../../../../../../utils/photoFiles.js";

const schemaRoute = {
  params: z.object({ station_id: z.coerce.number() }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          id: z.number(),
          attachment_uuid: z.string(),
          mime_type: z.string(),
          ...photoFileShape,
          is_main: z.boolean(),
          note: z.string().nullable(),
          taken_at: z.string().nullable(),
          createdAt: z.string(),
          author: z.object({ uuid: z.string(), username: z.string(), name: z.string(), image: z.string().nullable() }).nullable(),
        }),
      ),
    }),
  },
};

type ReqParams = { Params: { station_id: number } };
type PhotoItem = PhotoFileFields & {
  id: number;
  attachment_uuid: string;
  mime_type: string;
  is_main: boolean;
  note: string | null;
  taken_at: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string; image: string | null } | null;
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<PhotoItem[]>>) {
  const { station_id } = req.params;

  const station = await db.query.stations.findFirst({ where: { id: station_id } });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  const rows = await db
    .select({
      id: locationPhotos.id,
      attachment_uuid: attachments.uuid,
      mime_type: attachments.mime_type,
      ...photoFileColumns,
      is_main: stationPhotoSelections.is_main,
      note: locationPhotos.note,
      taken_at: locationPhotos.taken_at,
      createdAt: locationPhotos.createdAt,
      author_uuid: users.id,
      author_username: users.username,
      author_name: users.name,
      author_image: users.image,
    })
    .from(stationPhotoSelections)
    .innerJoin(locationPhotos, eq(stationPhotoSelections.location_photo_id, locationPhotos.id))
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .leftJoin(users, eq(locationPhotos.uploaded_by, users.id))
    .where(eq(stationPhotoSelections.station_id, station_id))
    .orderBy(desc(stationPhotoSelections.is_main), asc(locationPhotos.createdAt));

  return res.send({
    data: rows.map((r) => ({
      id: r.id,
      attachment_uuid: r.attachment_uuid,
      mime_type: r.mime_type,
      ...photoFileFields(r),
      is_main: r.is_main,
      note: r.note,
      taken_at: r.taken_at?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      author:
        r.author_uuid && r.author_username && r.author_name
          ? { uuid: r.author_uuid, username: r.author_username, name: r.author_name, image: r.author_image }
          : null,
    })),
  });
}

const getStationPhotos: Route<ReqParams, PhotoItem[]> = {
  url: "/stations/:station_id/photos",
  method: "GET",
  schema: schemaRoute,
  config: {
    allowGuestAccess: true,
  },
  handler,
};

export default getStationPhotos;

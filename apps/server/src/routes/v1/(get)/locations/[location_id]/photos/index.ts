import { attachments, locationPhotos, users } from "@openbts/drizzle";
import { desc, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  params: z.object({ location_id: z.coerce.number() }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          id: z.number(),
          attachment_uuid: z.string(),
          mime_type: z.string(),
          note: z.string().nullable(),
          taken_at: z.string().nullable(),
          createdAt: z.string(),
          author: z.object({ uuid: z.string(), username: z.string(), name: z.string() }).nullable(),
        }),
      ),
    }),
  },
};

type ReqParams = { Params: { location_id: number } };
type PhotoItem = {
  id: number;
  attachment_uuid: string;
  mime_type: string;
  note: string | null;
  taken_at: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string } | null;
};

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<PhotoItem[]>>) {
  const { location_id } = req.params;

  const location = await db.query.locations.findFirst({ where: { id: location_id } });
  if (!location) throw new ErrorResponse("NOT_FOUND");

  const rows = await db
    .select({
      id: locationPhotos.id,
      attachment_uuid: attachments.uuid,
      mime_type: attachments.mime_type,
      note: locationPhotos.note,
      taken_at: locationPhotos.taken_at,
      createdAt: locationPhotos.createdAt,
      author_uuid: users.id,
      author_username: users.username,
      author_name: users.name,
    })
    .from(locationPhotos)
    .innerJoin(attachments, eq(locationPhotos.attachment_id, attachments.id))
    .leftJoin(users, eq(locationPhotos.uploaded_by, users.id))
    .where(eq(locationPhotos.location_id, location_id))
    .orderBy(desc(locationPhotos.createdAt));

  return res.send({
    data: rows.map((r) => ({
      id: r.id,
      attachment_uuid: r.attachment_uuid,
      mime_type: r.mime_type,
      note: r.note,
      taken_at: r.taken_at?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      author: r.author_uuid && r.author_username && r.author_name ? { uuid: r.author_uuid, username: r.author_username, name: r.author_name } : null,
    })),
  });
}

const getLocationPhotos: Route<ReqParams, PhotoItem[]> = {
  url: "/locations/:location_id/photos",
  method: "GET",
  schema: schemaRoute,
  config: {
    allowGuestAccess: true,
  },
  handler,
};

export default getLocationPhotos;

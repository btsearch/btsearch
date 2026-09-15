import { locationPhotos } from "@openbts/drizzle";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../../../../../services/audit/index.js";

const schemaRoute = {
  params: z.object({ location_id: z.coerce.number(), photo_id: z.coerce.number() }),
  body: z
    .object({
      note: z.string().max(100).optional(),
      taken_at: z.iso.datetime().nullable().optional(),
    })
    .refine((b) => b.note !== undefined || b.taken_at !== undefined, { message: "At least one field required" }),
  response: {
    200: z.object({ data: z.object({ id: z.number(), note: z.string().nullable(), taken_at: z.string().nullable() }) }),
  },
};

type ReqParams = { Params: { location_id: number; photo_id: number } };
type ReqBody = { Body: { note?: string; taken_at?: string | null } };
type RequestData = ReqParams & ReqBody;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<{ id: number; note: string | null; taken_at: string | null }>>) {
  const { location_id, photo_id } = req.params;
  if (!req.userSession?.user) throw new ErrorResponse("UNAUTHORIZED");

  const photo = await db.query.locationPhotos.findFirst({
    where: { id: photo_id, location_id },
  });
  if (!photo) throw new ErrorResponse("NOT_FOUND");

  const setClause: Record<string, unknown> = {};
  if (req.body.note !== undefined) setClause.note = req.body.note.trim() || null;
  if (req.body.taken_at !== undefined) setClause.taken_at = req.body.taken_at ? new Date(req.body.taken_at) : null;

  const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "location.photos" }, async (tx, audit) => {
    const oldPhoto = await tx.query.locationPhotos.findFirst({ where: { id: photo_id, location_id } });
    if (!oldPhoto) throw new ErrorResponse("NOT_FOUND");
    const [nextPhoto] = await tx
      .update(locationPhotos)
      .set(setClause)
      .where(and(eq(locationPhotos.id, photo_id), eq(locationPhotos.location_id, location_id)))
      .returning();
    if (!nextPhoto) throw new ErrorResponse("FAILED_TO_UPDATE");
    await audit.log({
      entity: "location_photos",
      op: "update",
      recordId: photo_id,
      old: oldPhoto,
      new: nextPhoto,
      metadata: { location_id },
    });
    return nextPhoto;
  });

  return res.send({ data: { id: photo_id, note: updated.note ?? null, taken_at: updated.taken_at?.toISOString() ?? null } });
}

const updateLocationPhoto: Route<RequestData, { id: number; note: string | null; taken_at: string | null }> = {
  url: "/locations/:location_id/photos/:photo_id",
  method: "PATCH",
  schema: schemaRoute,
  config: { permissions: ["update:stations"] },
  handler,
};

export default updateLocationPhoto;

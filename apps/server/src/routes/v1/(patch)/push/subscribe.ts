import { pushSubscriptions } from "@openbts/drizzle";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const prefsSchema = z.object({
  id: z.uuid(),
  ukeUpdates: z.boolean().optional(),
  submissionUpdates: z.boolean().optional(),
  newSubmission: z.boolean().optional(),
  stationWatches: z.boolean().optional(),
});

const schemaRoute = {
  body: prefsSchema,
  response: {
    200: z.object({ data: z.object({ ok: z.boolean() }) }),
  },
};

type ReqBody = { Body: z.infer<typeof prefsSchema> };
type ResponseData = { data: { ok: boolean } };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const patch: Record<string, boolean> = {};
  if (req.body.ukeUpdates !== undefined) patch.officialDataUpdates = req.body.ukeUpdates;
  if (req.body.submissionUpdates !== undefined) patch.submissionUpdates = req.body.submissionUpdates;
  if (req.body.newSubmission !== undefined) patch.newSubmission = req.body.newSubmission;
  if (req.body.stationWatches !== undefined) patch.stationWatches = req.body.stationWatches;

  if (Object.keys(patch).length > 0)
    await db
      .update(pushSubscriptions)
      .set({ preferences: sql`preferences || ${sql.param(patch)}::jsonb` })
      .where(and(eq(pushSubscriptions.id, req.body.id), eq(pushSubscriptions.userId, session.user.id)));

  return res.send({ data: { ok: true } });
}

const updatePushSubscribe: Route<ReqBody, ResponseData> = {
  url: "/push/subscribe",
  method: "PATCH",
  schema: schemaRoute,
  handler,
};

export default updatePushSubscribe;

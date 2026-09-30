import { notifications } from "@openbts/drizzle";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const readNotificationSchema = z.object({ id: z.string(), readAt: z.date().nullable() });

const schemaRoute = {
  params: z.object({ id: z.string() }),
  response: {
    200: z.object({ data: readNotificationSchema }),
  },
};

type ReqParams = { Params: { id: string } };
type ResponseData = { data: z.infer<typeof readNotificationSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const { id } = req.params;

  const [updated] = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, session.user.id)))
    .returning({ id: notifications.id, readAt: notifications.readAt });

  if (!updated) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: updated });
}

const readNotification: Route<ReqParams, ResponseData> = {
  url: "/notifications/:id/read",
  method: "PATCH",
  schema: schemaRoute,
  handler,
};

export default readNotification;

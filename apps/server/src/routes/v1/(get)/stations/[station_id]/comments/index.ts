import { stationComments, users } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../../services/settings.service.js";

const stationCommentSelectSchema = createSelectSchema(stationComments);
const userSelectSchema = createSelectSchema(users).pick({ id: true, username: true, name: true, image: true });

const commentWithAuthorSchema = stationCommentSelectSchema.extend({
  author: userSelectSchema.nullable(),
});

const schemaRoute = {
  params: z.object({
    station_id: z.coerce.number<number>(),
  }),
  response: {
    200: z.object({
      data: z.array(commentWithAuthorSchema),
    }),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type ResponseData = z.infer<typeof commentWithAuthorSchema>[];

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;

  if (!getRuntimeSettings().enableStationComments) throw new ErrorResponse("FORBIDDEN");

  const station = await db.query.stations.findFirst({
    where: {
      id: station_id,
    },
  });
  if (!station) throw new ErrorResponse("NOT_FOUND");

  try {
    const comments = await db.query.stationComments.findMany({
      where: {
        AND: [{ station_id: { eq: station_id } }, { status: { eq: "approved" } }],
      },
      with: {
        author: {
          columns: { id: true, username: true, name: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.send({ data: comments });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const getStationComments: Route<ReqParams, ResponseData> = {
  url: "/stations/:station_id/comments",
  method: "GET",
  config: { permissions: ["read:stations"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getStationComments;

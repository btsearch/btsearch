import { stationComments } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import { createStationComment } from "../../../../../../features/comments/write.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../../lib/runtimeSettings.js";

const stationCommentSelectSchema = createSelectSchema(stationComments);

const schemaRoute = {
  params: z
    .object({
      station_id: z.coerce.number<number>(),
    })
    .strict(),
  response: {
    201: z
      .object({
        data: stationCommentSelectSchema,
      })
      .strict(),
  },
};

type ReqParams = { Params: z.infer<typeof schemaRoute.params> };
type RequestData = ReqParams;
type ResponseData = z.infer<typeof stationCommentSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const { station_id } = req.params;
  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart/form-data");
  const userId = req.userSession?.user.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");
  if (!getRuntimeSettings().enableStationComments) throw new ErrorResponse("FORBIDDEN");
  if (!isMultipart) throw new ErrorResponse("BAD_REQUEST");

  try {
    const station = await db.query.stations.findFirst({
      where: {
        id: station_id,
      },
    });
    if (!station) throw new ErrorResponse("NOT_FOUND");

    const newComment = await createStationComment(req, station_id, userId);

    return res.code(201).send({ data: newComment });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}

const createStationCommentRoute: Route<RequestData, ResponseData> = {
  url: "/stations/:station_id/comments",
  method: "POST",
  schema: schemaRoute,
  config: { permissions: ["create:comments"] },
  handler,
};

export default createStationCommentRoute;

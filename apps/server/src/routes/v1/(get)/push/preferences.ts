import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  querystring: z.object({ id: z.uuid() }),
  response: {
    200: z.object({
      data: z.object({
        ukeUpdates: z.boolean(),
        submissionUpdates: z.boolean(),
        newSubmission: z.boolean(),
        stationWatches: z.boolean(),
      }),
    }),
  },
};

type ReqQuery = { Querystring: { id: string } };
type ResponseData = { data: { ukeUpdates: boolean; submissionUpdates: boolean; newSubmission: boolean; stationWatches: boolean } };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const sub = await db.query.pushSubscriptions.findFirst({
    where: { id: req.query.id, userId: session.user.id },
    columns: { preferences: true },
  });

  const prefs = sub?.preferences ?? {};

  return res.send({
    data: {
      ukeUpdates: prefs.officialDataUpdates === true,
      submissionUpdates: prefs.submissionUpdates !== false,
      newSubmission: prefs.newSubmission !== false,
      stationWatches: prefs.stationWatches !== false,
    },
  });
}

const getPushPreferences: Route<ReqQuery, ResponseData> = {
  url: "/push/preferences",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getPushPreferences;

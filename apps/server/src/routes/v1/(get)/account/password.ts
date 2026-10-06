import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  querystring: z.object({
    userId: z.string().optional(),
  }),
  response: {
    200: z.object({
      data: z.object({ hasPassword: z.boolean() }),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResponseBody = { hasPassword: boolean };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  let targetUserId = session.user.id;

  const { userId } = req.query;
  if (userId) {
    const hasPermission = await hasStaffPermission(req, { user: ["set-password"] });
    if (!hasPermission) throw new ErrorResponse("FORBIDDEN");
    targetUserId = userId;
  }

  const credentialAccount = await db.query.accounts.findFirst({
    where: { AND: [{ userId: targetUserId }, { providerId: "credential" }] },
    columns: { id: true },
  });

  return res.send({ data: { hasPassword: !!credentialAccount } });
}

const getAccountPassword: Route<ReqQuery, ResponseBody> = {
  url: "/account/password",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getAccountPassword;

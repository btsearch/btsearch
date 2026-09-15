import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../../errors.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { auth } from "../../../../../../plugins/betterauth.plugin.js";

const schemaRoute = {
  params: z.object({ userId: z.string() }),
  response: {
    200: z.object({ data: z.null() }),
  },
};

type RequestData = { Params: z.infer<typeof schemaRoute.params> };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<null>>) {
  if (!req.userSession?.user) throw new ErrorResponse("UNAUTHORIZED");

  const targetUser = await db.query.users.findFirst({
    where: { id: req.params.userId },
    columns: { email: true, emailVerified: true },
  });

  if (!targetUser) throw new ErrorResponse("NOT_FOUND");
  if (targetUser.emailVerified) throw new ErrorResponse("BAD_REQUEST", { message: "Email address is already verified." });

  await auth.api.sendVerificationEmail({
    body: { email: targetUser.email, callbackURL: "/settings" },
  });

  return res.send({ data: null });
}

const resendVerification: Route<RequestData, null> = {
  url: "/admin/users/:userId/resend-verification",
  method: "POST",
  config: { permissions: ["resend-verification:user"] },
  schema: schemaRoute,
  handler,
};

export default resendVerification;

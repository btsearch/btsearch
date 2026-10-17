import { ownProfileSchema } from "@openbts/shared/contract";
import type { OwnProfile } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { assertTokenScope } from "../../../../features/access/staff.js";
import { loadOwnProfile } from "../../../../features/users/ownProfile.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get your profile",
  description: "Your profile as you edit it, including the hunter regions you keep while you are not listed in the hunters directory.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: ownProfileSchema,
    }),
  },
};
const errorReasons = {
  403: "The OAuth token does not have the `profile` scope.",
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<OwnProfile>>) {
  assertTokenScope(req, "profile");

  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await loadOwnProfile(userId) });
}

const getOwnProfile: Route<RouteGenericInterface, OwnProfile> = {
  url: "/me/profile",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getOwnProfile;

import { userParamsSchema, userProfileSchema } from "@openbts/shared/contract";
import type { UserProfile } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadUserProfile } from "../../../../../features/users/profile.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a user's profile",
  description:
    "The username is matched case-insensitively. " +
    "A private profile is not hidden behind a 404. It is returned with `isRestricted` set to `true`.",
  params: userParamsSchema,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: userProfileSchema,
    }),
  },
};
type ReqParams = { Params: z.infer<typeof userParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<UserProfile>>) {
  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await loadUserProfile(req, req.params.username) });
}

const getUserProfile: Route<ReqParams, UserProfile> = {
  url: "/users/:username",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getUserProfile;

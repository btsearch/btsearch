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
    "Returns a user's public profile. The username is matched case-insensitively. " +
    "Contact details are only returned to signed-in users. " +
    "A private profile is not hidden behind a 404. It is returned with `isRestricted` set to `true` and without the bio, contact details, " +
    "comment counts and `hunterRegionIds`, and its name and role are only returned to staff. The owner always gets the full profile. " +
    "The comment counts only include approved comments on stations in countries you can access.",
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
  config: { allowGuestAccess: true, errorReasons: { 404: "No user has this username." } },
  schema: schemaRoute,
  handler,
};

export default getUserProfile;

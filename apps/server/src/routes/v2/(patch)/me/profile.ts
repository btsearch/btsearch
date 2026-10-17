import { ownProfileSchema, ownProfileUpdateSchema } from "@openbts/shared/contract";
import type { OwnProfile, OwnProfileUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { assertTokenScope } from "../../../../features/access/staff.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { updateOwnProfile } from "../../../../features/users/ownProfile.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update your profile",
  description: "Send only the fields you change.",
  body: ownProfileUpdateSchema,
  response: {
    200: z.object({
      data: ownProfileSchema,
    }),
  },
};
const errorReasons = {
  400:
    "A region in `hunterRegionIds` does not exist, `isListedAsHunter` is `true` for a private profile, " +
    "or the profile would be listed as a hunter without regions.",
  403: "The OAuth token does not have the `profile` scope.",
};
type ReqBody = { Body: OwnProfileUpdate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<OwnProfile>>) {
  assertTokenScope(req, "profile");

  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  return res.send({ data: await updateOwnProfile(userId, req.body, await loadHiddenCountryCodes(req)) });
}

const patchOwnProfile: Route<ReqBody, OwnProfile> = {
  url: "/me/profile",
  method: "PATCH",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default patchOwnProfile;

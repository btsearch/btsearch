import { roleGrants, users } from "@openbts/drizzle";
import { meSchema } from "@openbts/shared/contract";
import type { Me } from "@openbts/shared/contract";
import { asc, eq } from "drizzle-orm";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { loadRegionIdsByGrant, toRoleGrant } from "../../../../features/access/roleGrants.js";
import { assertTokenScope } from "../../../../features/access/staff.js";
import { MAX_USER_LISTS } from "../../../../features/lists/limits.js";
import { SECURITY_FOR_ANY_ACCOUNT_CREDENTIAL } from "../../../../features/openapi/security.js";
import { findAnalyzerChangesLimit } from "../../../../features/submissions/analyzerLimit.js";
import { toUserRole } from "../../../../features/users/profile.js";
import { toUserRef } from "../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get the current user",
  security: SECURITY_FOR_ANY_ACCOUNT_CREDENTIAL,
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: meSchema,
    }),
  },
};
const errorReasons = {
  403: "The OAuth token does not have the `profile` scope.",
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<Me>>) {
  assertTokenScope(req, "profile");

  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const [user] = await db
    .select({ id: users.id, username: users.username, name: users.name, image: users.image, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ErrorResponse("UNAUTHORIZED");

  const role = toUserRole(user.role);
  const grantRows =
    role === "editor" ? await db.select().from(roleGrants).where(eq(roleGrants.userId, userId)).orderBy(asc(roleGrants.countryCode)) : [];
  const regionIdsByGrant = await loadRegionIdsByGrant(
    db,
    grantRows.map((row) => row.id),
  );
  const analyzerChanges = await findAnalyzerChangesLimit(req, userId, user.role);

  return res.send({
    data: {
      ...toUserRef(user),
      role,
      grants: grantRows.map((row) => toRoleGrant({ row, regionIds: regionIdsByGrant.get(row.id) ?? [] })),
      limits: { lists: MAX_USER_LISTS, analyzerChanges },
    },
  });
}

const getMe: Route<RouteGenericInterface, Me> = {
  url: "/me",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMe;

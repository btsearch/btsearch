import { roleGrants, users } from "@openbts/drizzle";
import { roleGrantListQuerySchema, roleGrantListSchema } from "@openbts/shared/contract";
import type { RoleGrantList, RoleGrantListQuery } from "@openbts/shared/contract";
import { type SQL, and, asc, eq, gt, inArray, or } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { accessFromRequest } from "../../../../features/access/access.js";
import { loadRegionIdsByGrant, toRoleGrant } from "../../../../features/access/roleGrants.js";
import { type CountryReach, assertTokenScope, getCountryReach } from "../../../../features/access/staff.js";
import { SECURITY_FOR_ANY_ACCOUNT_CREDENTIAL } from "../../../../features/openapi/security.js";
import { toUserRef } from "../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { decodeCursor, encodeCursor } from "../../../../lib/cursor.js";

const cursorSchema = z.object({ id: z.uuid() });
const schemaRoute = {
  summary: "List role grants",
  description:
    "Returns the role grants you are allowed to see. " +
    "You always see your own grants. Administrators see every grant, and maintainers also see all grants in the countries they maintain. " +
    "With an OAuth token, seeing more than your own grants also requires the `update:role_grants` scope. " +
    "`userIds` and `countryCodes` only narrow this down, so grants you cannot see are left out instead of causing an error. " +
    "A grant whose `regionIds` is `null` covers the whole country. " +
    "With an API key you only ever see the grants of the account the key belongs to.",
  security: SECURITY_FOR_ANY_ACCOUNT_CREDENTIAL,
  querystring: roleGrantListQuerySchema,
  response: {
    200: roleGrantListSchema,
  },
};
type ReqQuery = { Querystring: RoleGrantListQuery };

function visibleGrants(reach: CountryReach, userId: string): SQL | undefined {
  if (reach.isEverywhere) return undefined;

  const isOwn = eq(roleGrants.userId, userId);
  return reach.countryCodes.length > 0 ? or(isOwn, inArray(roleGrants.countryCode, reach.countryCodes)) : isOwn;
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<RoleGrantList>>) {
  const { userIds, countryCodes, include, limit, cursor } = req.query;
  assertTokenScope(req, "profile");

  const access = await accessFromRequest(req);
  if (!access) throw new ErrorResponse("UNAUTHORIZED");

  const reach = await getCountryReach(req, { role_grants: ["update"] });
  const after = cursor === undefined ? undefined : decodeCursor(cursor, cursorSchema).id;

  const rows = await db
    .select()
    .from(roleGrants)
    .where(
      and(
        visibleGrants(reach, access.userId),
        userIds ? inArray(roleGrants.userId, userIds) : undefined,
        countryCodes ? inArray(roleGrants.countryCode, countryCodes) : undefined,
        after ? gt(roleGrants.id, after) : undefined,
      ),
    )
    .orderBy(asc(roleGrants.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  const [regionIdsByGrant, userRows] = await Promise.all([
    loadRegionIdsByGrant(
      db,
      page.map((row) => row.id),
    ),
    include?.includes("user") && page.length > 0
      ? db
          .select({ id: users.id, username: users.username, name: users.name, image: users.image })
          .from(users)
          .where(inArray(users.id, [...new Set(page.map((row) => row.userId))]))
      : [],
  ]);
  const usersById = new Map(userRows.map((user) => [user.id, toUserRef(user)]));

  return res.send({
    data: page.map((row) => toRoleGrant({ row, regionIds: regionIdsByGrant.get(row.id) ?? [] }, usersById.get(row.userId))),
    paging: { limit, nextCursor: rows.length > limit && last ? encodeCursor({ id: last.id }) : null },
  });
}

const getRoleGrants: Route<ReqQuery, RoleGrantList> = {
  url: "/role-grants",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getRoleGrants;

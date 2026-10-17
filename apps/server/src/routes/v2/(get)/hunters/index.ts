import { hunterRegions, regions, users } from "@openbts/drizzle";
import { hunterListQuerySchema, hunterListSchema } from "@openbts/shared/contract";
import type { HunterList, HunterListQuery, Paging } from "@openbts/shared/contract";
import { type SQL, and, asc, eq, exists, inArray, notInArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { normalizeContact } from "../../../../features/users/profile.js";
import { toUserRef } from "../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { type SortColumn, createKeyset } from "../../../../lib/keyset.js";

const SORT_COLUMNS: Record<"name", SortColumn> = { name: { column: users.name, kind: "text" } };

const cursorIdSchema = z.uuid();
const schemaRoute = {
  summary: "List hunters",
  description:
    "People who help find and document stations and chose to be listed in the hunters directory. " +
    "A hunter has a public profile and at least one region in a country you can see. Sorted by name.",
  querystring: hunterListQuerySchema,
  response: {
    200: hunterListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
};
type ReqQuery = { Querystring: HunterListQuery };

function regionConditions(
  hiddenCountryCodes: string[],
  { countryCodes, regionIds }: Pick<HunterListQuery, "countryCodes" | "regionIds">,
): SQL | undefined {
  return and(
    notInArray(regions.countryCode, hiddenCountryCodes),
    countryCodes ? inArray(regions.countryCode, countryCodes) : undefined,
    regionIds ? inArray(hunterRegions.regionId, regionIds) : undefined,
  );
}

async function loadRegionIdsByUser(userIds: string[], hiddenCountryCodes: string[]): Promise<Map<string, number[]>> {
  const regionIdsByUser = new Map<string, number[]>();
  if (userIds.length === 0) return regionIdsByUser;

  const rows = await db
    .select({ userId: hunterRegions.userId, regionId: hunterRegions.regionId })
    .from(hunterRegions)
    .innerJoin(regions, eq(regions.id, hunterRegions.regionId))
    .where(and(inArray(hunterRegions.userId, userIds), regionConditions(hiddenCountryCodes, {})))
    .orderBy(asc(hunterRegions.regionId));
  for (const row of rows) regionIdsByUser.set(row.userId, [...(regionIdsByUser.get(row.userId) ?? []), row.regionId]);
  return regionIdsByUser;
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<HunterList>>) {
  if (actorIdFromRequest(req) === null) throw new ErrorResponse("UNAUTHORIZED");

  const { limit, cursor } = req.query;
  const hiddenCountryCodes = await loadHiddenCountryCodes(req);
  const keyset = createKeyset("name", users.id, SORT_COLUMNS, cursor, cursorIdSchema);

  const hasMatchingRegion = exists(
    db
      .select({ userId: hunterRegions.userId })
      .from(hunterRegions)
      .innerJoin(regions, eq(regions.id, hunterRegions.regionId))
      .where(and(eq(hunterRegions.userId, users.id), regionConditions(hiddenCountryCodes, req.query))),
  );
  const rows = await db
    .select({ id: users.id, username: users.username, name: users.name, image: users.image, contactInfo: users.contactInfo, key: keyset.key })
    .from(users)
    .where(and(eq(users.hunterListing, true), eq(users.profileVisibility, "public"), hasMatchingRegion, keyset.after))
    .orderBy(...keyset.orderBy)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.id, key: last.key }) : null };

  const regionIdsByUser = await loadRegionIdsByUser(
    page.map((row) => row.id),
    hiddenCountryCodes,
  );

  res.header("Cache-Control", "private, no-store");
  return res.send({
    data: page.map((row) => ({ ...toUserRef(row), contact: normalizeContact(row.contactInfo), regionIds: regionIdsByUser.get(row.id) ?? [] })),
    paging,
  });
}

const getHunters: Route<ReqQuery, HunterList> = {
  url: "/hunters",
  method: "GET",
  config: { errorReasons },
  schema: schemaRoute,
  handler,
};

export default getHunters;

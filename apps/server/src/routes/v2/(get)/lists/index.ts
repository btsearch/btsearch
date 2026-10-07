import { userLists } from "@openbts/drizzle";
import { listListQuerySchema, listListSchema } from "@openbts/shared/contract";
import type { ListList, ListListQuery, Paging } from "@openbts/shared/contract";
import { type SQL, and, count, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import { toLists } from "../../../../features/lists/serialize.js";
import { assertListsEnabled } from "../../../../features/lists/visibility.js";
import { containsPattern } from "../../../../features/search/text.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { flagCondition } from "../../../../lib/conditions.js";
import { decodeCursor, encodeCursor } from "../../../../lib/cursor.js";

const cursorSchema = z.object({ id: z.number().int() });
const schemaRoute = {
  summary: "List your lists",
  description:
    "Returns your own lists, newest first. Administrators can set `owners=all` to get everyone's lists, " +
    "and add `ownerIds` to get only the lists of those users. " +
    "Both need the `read_all:user_lists` permission. If you send either of them without it, you get a 403, whatever else you ask for. " +
    "`ownerIds` only works together with `owners=all`. " +
    "`isPublic` keeps only the public lists or only the private ones. " +
    "`q` matches part of the list name. " +
    "`stationIds`, `officialSiteIds` and `microwaveLinkIds` each keep only lists that contain at least one of the given ids. " +
    "Stations in countries you cannot access are left out of `itemCounts.stations` and `items.stationIds`.",
  querystring: listListQuerySchema,
  response: {
    200: listListSchema,
  },
};
const errorReasons = {
  400: "The request is invalid, or `ownerIds` was sent without `owners=all`.",
  403: "Lists are disabled, or you sent `owners=all` or `ownerIds` without being an administrator.",
};
const OWNER_FILTER_REFUSAL = "Only an administrator can filter lists by owner";
type ReqQuery = { Querystring: ListListQuery };

function containsAny(items: SQL, ids: readonly number[] | undefined): SQL | undefined {
  if (!ids) return undefined;
  return or(...ids.map((id) => sql`(${items}) @> ${JSON.stringify([id])}::jsonb`));
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ListList>>) {
  assertListsEnabled();
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const { owners, ownerIds, isPublic, q, stationIds, officialSiteIds, microwaveLinkIds, include, limit, cursor, offset, includeTotal } = req.query;

  const readsEveryone = owners === "all";
  const canReadEveryone = (readsEveryone || ownerIds !== undefined) && (await hasStaffPermission(req, { user_lists: ["read_all"] }));

  if (ownerIds && !canReadEveryone) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS", { message: OWNER_FILTER_REFUSAL });
  if (readsEveryone && !canReadEveryone) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  if (ownerIds && !readsEveryone) throw new ErrorResponse("INVALID_QUERY", { message: "ownerIds needs owners=all" });

  const filters = and(
    readsEveryone ? undefined : eq(userLists.created_by, userId),
    ownerIds ? inArray(userLists.created_by, ownerIds) : undefined,
    isPublic === undefined ? undefined : flagCondition(userLists.is_public, isPublic),
    q ? ilike(userLists.name, containsPattern(q)) : undefined,
    containsAny(sql`${userLists.stations} -> 'internal'`, stationIds),
    containsAny(sql`${userLists.stations} -> 'uke'`, officialSiteIds),
    containsAny(sql`${userLists.radiolines}`, microwaveLinkIds),
  );
  const after = cursor === undefined ? undefined : decodeCursor(cursor, cursorSchema).id;

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(userLists)
      .where(and(filters, after === undefined ? undefined : lt(userLists.id, after)))
      .orderBy(desc(userLists.id))
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal ? db.select({ total: count() }).from(userLists).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? encodeCursor({ id: last.id }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({ data: await toLists(page, userId, await loadHiddenCountryCodes(req), include), paging });
}

const getLists: Route<ReqQuery, ListList> = {
  url: "/lists",
  method: "GET",
  config: { permissions: ["read:user_lists"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getLists;

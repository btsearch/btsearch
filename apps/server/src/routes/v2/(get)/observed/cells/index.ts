import { observedCells } from "@openbts/drizzle";
import { observedCellListQuerySchema, observedCellListSchema } from "@openbts/shared/contract";
import type { ObservedCellList, ObservedCellListQuery, Paging } from "@openbts/shared/contract";
import { and, count } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../../database/psql.js";
import { assertObservationsOn } from "../../../../../features/observed/access.js";
import { findObservedCellRecords, observedCellListConditions } from "../../../../../features/observed/cells/read.js";
import { observedCellsVisibleTo } from "../../../../../features/observed/cells/visibility.js";
import { resolveObservedCellFilters } from "../../../../../features/observed/filters.js";
import { withObservedSites } from "../../../../../features/observed/sites/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { createKeyset } from "../../../../../lib/keyset.js";

const schemaRoute = {
  summary: "List observed cells",
  description:
    "The cells phones running the BTSearch app measured, sorted by id. You get:\n\n" +
    "- the cells matched to a station you can see, and the cells of public estimated sites\n" +
    "- signed in through the app or the website, also the cells of the sites you measured\n" +
    "- as an editor, also the cells of the sites inside your grants\n" +
    "- as an administrator, every cell\n\n" +
    "A value counts once two people reported it, and the latest such value is shown. " +
    "Copies of a cell observed under another network are left out unless you ask with `includeCopies=true`.",
  querystring: observedCellListQuerySchema,
  response: {
    200: observedCellListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid, or `limit` is above 200 with `include`.",
  403: "Observed data is switched off and you are not an administrator.",
};
type ReqQuery = { Querystring: ObservedCellListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ObservedCellList>>) {
  res.header("Cache-Control", "private, no-store");
  await assertObservationsOn(req);
  const { include, limit, cursor, includeTotal } = req.query;

  const [visible, filters] = await Promise.all([observedCellsVisibleTo(req), resolveObservedCellFilters(req.query)]);
  const conditions = and(visible, ...observedCellListConditions(req.query, filters));
  const keyset = createKeyset("id", observedCells.id, { id: null }, cursor);

  const [rows, totals] = await Promise.all([
    db
      .select({ id: observedCells.id })
      .from(observedCells)
      .where(and(conditions, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1),
    includeTotal ? db.select({ total: count() }).from(observedCells).where(conditions) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.id, key: null }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  const pageIds = page.map((row) => row.id);
  const records = await findObservedCellRecords(pageIds, include);
  return res.send({ data: include?.includes("observedSite") ? await withObservedSites(req, records) : records, paging });
}

const getObservedCells: Route<ReqQuery, ObservedCellList> = {
  url: "/observed/cells",
  method: "GET",
  config: { permissions: ["read:observations"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservedCells;

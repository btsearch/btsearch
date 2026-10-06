import { cells, gsmCells, lteCells, nrCells, stations, umtsCells } from "@openbts/drizzle";
import { cellListQuerySchema, cellListSchema } from "@openbts/shared/contract";
import type { CellList, CellListQuery, CellSort, Paging } from "@openbts/shared/contract";
import { and, count, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../database/psql.js";
import { cellFilterConditions, listedCellColumns, serializeCells } from "../../../../features/cells/read.js";
import { loadHiddenCountryCodes } from "../../../../features/countries/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { type SortColumn, type SortField, createKeyset } from "../../../../lib/keyset.js";

const SORT_COLUMNS: Record<SortField<CellSort>, SortColumn | null> = {
  id: null,
  createdAt: { column: cells.createdAt, kind: "instant" },
  updatedAt: { column: cells.updatedAt, kind: "instant" },
};

const schemaRoute = {
  summary: "List cells",
  description:
    "Returns cells across all stations, one page at a time. " +
    "Cells of inactive stations are left out unless you ask for them with `statuses`. " +
    "Cells in countries you cannot access are always left out. " +
    "If an operator in `operatorIds` is a shared network, the cells of its members are returned too.",
  querystring: cellListQuerySchema,
  response: {
    200: cellListSchema,
  },
};
const errorReasons = {
  400: "A query parameter did not pass validation, or the `cursor` is invalid. A cursor only works with the `sort` it was returned for.",
};
type ReqQuery = { Querystring: CellListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<CellList>>) {
  const { include, sort, limit, cursor, offset, includeTotal } = req.query;

  const filters = and(...cellFilterConditions(req.query, await loadHiddenCountryCodes(req)));
  const keyset = createKeyset(sort, cells.id, SORT_COLUMNS, cursor);

  const [rows, totals] = await Promise.all([
    db
      .select({ ...listedCellColumns, key: keyset.key })
      .from(cells)
      .innerJoin(stations, eq(stations.id, cells.station_id))
      .leftJoin(gsmCells, eq(gsmCells.cell_id, cells.id))
      .leftJoin(umtsCells, eq(umtsCells.cell_id, cells.id))
      .leftJoin(lteCells, eq(lteCells.cell_id, cells.id))
      .leftJoin(nrCells, eq(nrCells.cell_id, cells.id))
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1)
      .offset(offset ?? 0),
    includeTotal ? db.select({ total: count() }).from(cells).innerJoin(stations, eq(stations.id, cells.station_id)).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.cell.id, key: last.key }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({ data: await serializeCells(page, include), paging });
}

const getCells: Route<ReqQuery, CellList> = {
  url: "/cells",
  method: "GET",
  config: { permissions: ["read:cells"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getCells;

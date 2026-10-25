import { measurementContributorListQuerySchema, measurementContributorListSchema } from "@openbts/shared/contract";
import type { MeasurementContributorList, MeasurementContributorListQuery, Paging } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { countContributors, findContributors, findRankedContributorIds } from "../../../../../features/measurements/contributors/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../../lib/cursor.js";

const schemaRoute = {
  summary: "List contributors",
  description: "Everyone who accepted the contributor terms, uploads or not.",
  tags: ["measurement-administration"],
  querystring: measurementContributorListQuerySchema,
  response: {
    200: measurementContributorListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
};
type ReqQuery = { Querystring: MeasurementContributorListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MeasurementContributorList>>) {
  res.header("Cache-Control", "private, no-store");
  const { limit, includeTotal } = req.query;
  const offset = resolveOffset(req.query);

  const [userIds, total] = await Promise.all([
    findRankedContributorIds(req.query, limit + 1, offset),
    includeTotal ? countContributors(req.query) : null,
  ]);
  const paging: Paging = { limit, nextCursor: userIds.length > limit ? encodeCursor({ offset: offset + limit }) : null };
  if (total !== null) paging.total = total;

  return res.send({ data: await findContributors(userIds.slice(0, limit)), paging });
}

const getMeasurementContributors: Route<ReqQuery, MeasurementContributorList> = {
  url: "/measurements/contributors",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementContributors;

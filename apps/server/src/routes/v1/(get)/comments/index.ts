import { operators, stationComments, stations, users } from "@openbts/drizzle";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.ts";
import { ErrorResponse } from "../../../../errors.ts";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.ts";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.ts";

const stationCommentSelectSchema = createSelectSchema(stationComments);
const userSelectSchema = createSelectSchema(users).pick({ id: true, username: true, name: true, image: true });
const stationWithOperatorSchema = createSelectSchema(stations)
  .pick({ id: true, station_id: true })
  .extend({ operator: createSelectSchema(operators).nullable() });

const commentWithRelationsSchema = stationCommentSelectSchema.extend({
  author: userSelectSchema.nullable(),
  station: stationWithOperatorSchema.nullable(),
});

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().min(1).max(100).default(25),
    offset: z.coerce.number().min(0).default(0),
    search: z.string().optional(),
    author_ids: z.string().optional(),
    status: z.enum(["pending", "approved"]).optional(),
    sortBy: z.enum(["createdAt", "id"]).default("createdAt"),
    sort: z.enum(["asc", "desc"]).default("desc"),
  }),
  response: {
    200: z.object({
      data: z.array(commentWithRelationsSchema),
      totalCount: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResponseData = { data: z.infer<typeof commentWithRelationsSchema>[]; totalCount: number };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseData>>) {
  const userId = req.userSession?.user.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");

  const { limit, offset, search, author_ids, status, sortBy, sort } = req.query;

  const buildWhereConditions = (fields: typeof stationComments) => {
    const conditions: ReturnType<typeof sql>[] = [];

    if (search) {
      const like = `%${search}%`;
      conditions.push(sql`(
        ${fields.content} ILIKE ${like}
        OR EXISTS (
          SELECT 1 FROM ${stations}
          WHERE ${stations.id} = ${fields.station_id}
          AND ${stations.station_id} ILIKE ${like}
        )
      )`);
    }

    if (author_ids) {
      const ids = author_ids.split(",").filter(Boolean);
      if (ids.length === 1) conditions.push(eq(fields.user_id, ids[0]!));
      else if (ids.length > 1) conditions.push(inArray(fields.user_id, ids));
    }

    if (status) conditions.push(sql`${fields.status} = ${status}`);

    return conditions;
  };

  const countConditions = buildWhereConditions(stationComments);
  const countWhereClause = countConditions.length ? and(...countConditions) : undefined;

  const [totalRow, comments] = await Promise.all([
    db.select({ count: count() }).from(stationComments).where(countWhereClause),
    db.query.stationComments.findMany({
      limit,
      offset,
      orderBy: { [sortBy ?? "id"]: sort },
      where: {
        RAW: (fields) => and(...buildWhereConditions(fields)) ?? sql`true`,
      },
      with: {
        author: {
          columns: { id: true, username: true, name: true, image: true },
        },
        station: {
          columns: { id: true, station_id: true },
          with: {
            operator: true,
          },
        },
      },
    }),
  ]);

  return res.send({ data: comments as ResponseData["data"], totalCount: totalRow[0]?.count ?? 0 });
}

const getComments: Route<ReqQuery, ResponseData> = {
  url: "/comments",
  method: "GET",
  config: { permissions: ["read_all:comments"] },
  schema: schemaRoute,
  handler,
};

export default getComments;

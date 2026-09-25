import { deletedEntries } from "@openbts/drizzle";
import { type SQL, and, count, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  querystring: z.object({
    source_table: z.enum(["uke_permits", "uke_radiolines"]).optional(),
    source_type: z.enum(["permits", "device_registry", "radiolines"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    search: z.string().optional(),
  }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          id: z.number(),
          source_table: z.string(),
          source_id: z.number(),
          source_type: z.string(),
          data: z.unknown(),
          deleted_at: z.coerce.date(),
          import_id: z.number().nullable(),
        }),
      ),
      totalCount: z.number(),
    }),
  },
};

type ReqQuery = {
  Querystring: z.infer<typeof schemaRoute.querystring>;
};

interface DeletedEntry {
  id: number;
  source_table: string;
  source_id: number;
  source_type: string;
  data: unknown;
  deleted_at: Date;
  import_id: number | null;
}

interface Response {
  data: DeletedEntry[];
  totalCount: number;
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<Response>>) {
  const { source_table, source_type, from, to, page, limit, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    const conditions: (SQL<unknown> | undefined)[] = [];
    if (source_table) conditions.push(eq(deletedEntries.source_table, source_table));
    if (source_type) conditions.push(eq(deletedEntries.source_type, source_type));
    if (from) conditions.push(gte(deletedEntries.deleted_at, from));
    if (to) conditions.push(lte(deletedEntries.deleted_at, to));
    if (search) {
      conditions.push(
        sql`(
          ${deletedEntries.data}->>'station_id' ILIKE ${`%${search}%`} OR
          ${deletedEntries.data}->>'permit_number' ILIKE ${`%${search}%`} OR
          ${deletedEntries.data}->>'decision_number' ILIKE ${`%${search}%`}
        )`,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(deletedEntries)
        .where(where)
        .orderBy(sql`${deletedEntries.deleted_at} DESC`)
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(deletedEntries).where(where),
    ]);

    return res.send({
      data: rows,
      totalCount: totalResult[0]?.value ?? 0,
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", {
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error,
    });
  }
}

const getDeletedEntries: Route<ReqQuery, Response> = {
  url: "/deleted-entries",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:deleted_entries"], allowGuestAccess: true },
  handler,
};

export default getDeletedEntries;

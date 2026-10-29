import { users } from "@openbts/drizzle";
import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import { EmptyFilter } from "drizzle-orm/relations";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const userSchema = createSelectSchema(users);

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().min(1).max(100).default(25),
    offset: z.coerce.number().min(0).default(0),
    search: z.string().optional(),
    role: z.enum(["user", "editor", "admin"]).optional(),
    banned: z.enum(["true", "false"]).optional(),
  }),
  response: {
    200: z.object({
      data: z.array(userSchema),
      total: z.number(),
      limit: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResponseBody = { data: z.infer<typeof userSchema>[]; total: number; limit: number };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const session = req.userSession;
  const apiToken = req.apiToken;
  if (!session?.user && !apiToken) throw new ErrorResponse("UNAUTHORIZED");

  const userId = session?.user?.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");

  const { limit, offset, search, role, banned } = req.query;

  const buildConditions = (fields: typeof users) => {
    const conditions = [];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(ilike(fields.name, pattern), ilike(fields.username, pattern), ilike(fields.email, pattern)));
    }
    if (role) conditions.push(eq(fields.role, role));
    if (banned !== undefined) conditions.push(eq(fields.banned, banned === "true"));
    return conditions;
  };

  const countConditions = buildConditions(users);
  const whereClause = countConditions.length > 0 ? and(...countConditions) : undefined;

  const [totalCount] = await db.select({ count: count() }).from(users).where(whereClause);

  const rows = await db.query.users.findMany({
    limit,
    offset,
    orderBy: { createdAt: "desc" },
    where: countConditions.length > 0 ? { RAW: (fields) => and(...buildConditions(fields)) ?? sql`true` } : EmptyFilter,
  });

  return res.send({ data: rows as z.infer<typeof userSchema>[], total: totalCount?.count ?? 0, limit });
}

const getAdminUsers: Route<ReqQuery, ResponseBody> = {
  url: "/admin/users",
  method: "GET",
  config: { permissions: ["list:user"] },
  schema: schemaRoute,
  handler,
};

export default getAdminUsers;

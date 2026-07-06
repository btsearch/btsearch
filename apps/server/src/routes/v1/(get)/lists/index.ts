import { userLists, users } from "@openbts/drizzle";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../plugins/auth/utils.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const userListsSchema = createSelectSchema(userLists);
const usersSchema = createSelectSchema(users).pick({ id: true, name: true, username: true, image: true });

const createdBySchema = usersSchema.pick({ name: true, username: true, image: true }).partial().extend({ uuid: z.string() });

const listItemSchema = userListsSchema
  .pick({ id: true, uuid: true, name: true, description: true, is_public: true, notificationsEnabled: true, createdAt: true, updatedAt: true })
  .extend({
    stations: z.object({ internal: z.array(z.number()), uke: z.array(z.number()) }),
    radiolines: z.array(z.number()),
    stationCount: z.number(),
    radiolineCount: z.number(),
    createdBy: createdBySchema,
  });

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    page: z.coerce.number().min(1).default(1),
    search: z.string().optional(),
    all: z.coerce.boolean().optional().default(false),
  }),
  response: {
    200: z.object({
      data: z.array(listItemSchema),
      totalCount: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResponseBody = z.infer<(typeof schemaRoute.response)["200"]>;

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FORBIDDEN");
  if (!req.userSession) throw new ErrorResponse("UNAUTHORIZED");

  const { limit, page, search, all } = req.query;
  const offset = (page - 1) * limit;
  const userId = req.userSession.user.id;

  const isAdmin = await verifyPermissions(userId, { user_lists: ["read"] });
  const showAll = isAdmin && all;

  const whereClause = and(showAll ? undefined : eq(userLists.created_by, userId), search ? ilike(userLists.name, `%${search}%`) : undefined);

  const countQuery = db.select({ count: count() }).from(userLists).where(whereClause);

  if (showAll) {
    const [countResult, rows] = await Promise.all([
      countQuery,
      db
        .select({
          id: userLists.id,
          uuid: userLists.uuid,
          name: userLists.name,
          description: userLists.description,
          is_public: userLists.is_public,
          notificationsEnabled: userLists.notificationsEnabled,
          stations: userLists.stations,
          radiolines: userLists.radiolines,
          created_by: userLists.created_by,
          createdAt: userLists.createdAt,
          updatedAt: userLists.updatedAt,
          createdByName: users.name,
          createdByUsername: users.username,
          createdByImage: users.image,
        })
        .from(userLists)
        .leftJoin(users, eq(userLists.created_by, users.id))
        .where(whereClause)
        .orderBy(desc(userLists.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const totalCount = countResult[0]?.count ?? 0;
    const data = rows.map((row) => {
      const stations = (row.stations as { internal: number[]; uke: number[] }) ?? { internal: [], uke: [] };
      const radiolines = (row.radiolines as number[]) ?? [];
      return {
        id: row.id,
        uuid: row.uuid,
        name: row.name,
        description: row.description,
        is_public: row.is_public,
        notificationsEnabled: row.notificationsEnabled,
        stations,
        radiolines,
        stationCount: stations.internal.length + stations.uke.length,
        radiolineCount: radiolines.length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: {
          uuid: row.created_by,
          ...(row.createdByName ? { name: row.createdByName, username: row.createdByUsername ?? null, image: row.createdByImage ?? null } : {}),
        },
      };
    });

    return res.send({ data, totalCount });
  }

  const [countResult, rows] = await Promise.all([
    countQuery,
    db.select().from(userLists).where(whereClause).orderBy(desc(userLists.createdAt)).limit(limit).offset(offset),
  ]);

  const totalCount = countResult[0]?.count ?? 0;
  const data = rows.map((row) => {
    const stations = (row.stations as { internal: number[]; uke: number[] }) ?? { internal: [], uke: [] };
    const radiolines = (row.radiolines as number[]) ?? [];
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      description: row.description,
      is_public: row.is_public,
      notificationsEnabled: row.notificationsEnabled,
      stations,
      radiolines,
      stationCount: stations.internal.length + stations.uke.length,
      radiolineCount: radiolines.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: { uuid: row.created_by },
    };
  });

  return res.send({ data, totalCount });
}

const getLists: Route<ReqQuery, ResponseBody> = {
  url: "/lists",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getLists;

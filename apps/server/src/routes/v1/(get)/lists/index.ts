import { operators, stations, ukeStations, userLists, users } from "@openbts/drizzle";
import { and, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { hasStaffPermission } from "../../../../features/access/staff.js";
import { findForeignStationIds } from "../../../../features/countries/legacy.js";
import { MAX_USER_LISTS } from "../../../../features/lists/limits.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../lib/runtimeSettings.js";

const userListsSchema = createSelectSchema(userLists);
const usersSchema = createSelectSchema(users).pick({ id: true, name: true, username: true, image: true });

const createdBySchema = usersSchema.pick({ name: true, username: true, image: true }).partial().extend({ uuid: z.string() });

const listOperatorSchema = z.object({ name: z.string(), mnc: z.number().nullable(), count: z.number() });

const listItemSchema = userListsSchema
  .pick({ id: true, uuid: true, name: true, description: true, is_public: true, notificationsEnabled: true, createdAt: true, updatedAt: true })
  .extend({
    stations: z.object({ internal: z.array(z.number()), uke: z.array(z.number()) }),
    radiolines: z.array(z.number()),
    stationCount: z.number(),
    radiolineCount: z.number(),
    operators: z.array(listOperatorSchema),
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
      maxLists: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResponseBody = z.infer<(typeof schemaRoute.response)["200"]>;
type ListOperator = z.infer<typeof listOperatorSchema>;
type StationOperator = { id: number; name: string; mnc: number | null };
type ListStations = { internal: number[]; uke: number[] };

async function selectInternalStationOperators(ids: number[]): Promise<StationOperator[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: stations.id, name: operators.name, mnc: operators.mnc })
    .from(stations)
    .innerJoin(operators, eq(stations.operator_id, operators.id))
    .where(inArray(stations.id, ids));
}

async function selectUkeStationOperators(ids: number[]): Promise<StationOperator[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: ukeStations.id, name: operators.name, mnc: operators.mnc })
    .from(ukeStations)
    .innerJoin(operators, eq(ukeStations.operator_id, operators.id))
    .where(inArray(ukeStations.id, ids));
}

function countListOperators(stationIds: ListStations, internal: Map<number, StationOperator>, uke: Map<number, StationOperator>): ListOperator[] {
  const counts = new Map<string, ListOperator>();
  const add = (operator: StationOperator | undefined) => {
    if (!operator) return;
    const existing = counts.get(operator.name);
    if (existing) existing.count += 1;
    else counts.set(operator.name, { name: operator.name, mnc: operator.mnc, count: 1 });
  };

  for (const id of stationIds.internal) add(internal.get(id));
  for (const id of stationIds.uke) add(uke.get(id));
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  if (!getRuntimeSettings().enableUserLists) throw new ErrorResponse("FORBIDDEN");
  if (!req.userSession) throw new ErrorResponse("UNAUTHORIZED");

  const { limit, page, search, all } = req.query;
  const offset = (page - 1) * limit;
  const userId = req.userSession.user.id;

  const isAdmin = await hasStaffPermission(req, { user_lists: ["read_all"] });
  const showAll = isAdmin && all;

  const whereClause = and(showAll ? undefined : eq(userLists.created_by, userId), search ? ilike(userLists.name, `%${search}%`) : undefined);

  const [countResult, rows] = await Promise.all([
    db.select({ count: count() }).from(userLists).where(whereClause),
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
  const storedStations = rows.map((row) => (row.stations as ListStations) ?? { internal: [], uke: [] });
  const foreign = await findForeignStationIds(storedStations.flatMap((entry) => entry.internal));
  const listStations = storedStations.map(({ internal, uke }) => ({ internal: internal.filter((id) => !foreign.has(id)), uke }));
  const [internalOperators, ukeOperators] = await Promise.all([
    selectInternalStationOperators([...new Set(listStations.flatMap((entry) => entry.internal))]),
    selectUkeStationOperators([...new Set(listStations.flatMap((entry) => entry.uke))]),
  ]);
  const internalOperatorById = new Map(internalOperators.map((operator) => [operator.id, operator]));
  const ukeOperatorById = new Map(ukeOperators.map((operator) => [operator.id, operator]));

  const data = rows.map((row, index) => {
    const stationIds = listStations[index] ?? { internal: [], uke: [] };
    const radiolines = (row.radiolines as number[]) ?? [];
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      description: row.description,
      is_public: row.is_public,
      notificationsEnabled: row.notificationsEnabled,
      stations: stationIds,
      radiolines,
      stationCount: stationIds.internal.length + stationIds.uke.length,
      radiolineCount: radiolines.length,
      operators: countListOperators(stationIds, internalOperatorById, ukeOperatorById),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: {
        uuid: row.created_by,
        ...(showAll && row.createdByName
          ? { name: row.createdByName, username: row.createdByUsername ?? null, image: row.createdByImage ?? null }
          : {}),
      },
    };
  });

  return res.send({ data, totalCount, maxLists: MAX_USER_LISTS });
}

const getLists: Route<ReqQuery, ResponseBody> = {
  url: "/lists",
  method: "GET",
  config: { permissions: ["read:user_lists"] },
  schema: schemaRoute,
  handler,
};

export default getLists;

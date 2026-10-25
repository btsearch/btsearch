import { devices } from "@openbts/drizzle";
import { measurementDeviceListQuerySchema, measurementDeviceListSchema } from "@openbts/shared/contract";
import type { MeasurementDeviceList, MeasurementDeviceListQuery, Paging } from "@openbts/shared/contract";
import { and, count, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { canManageMeasurements, coversEveryone } from "../../../../../features/measurements/access.js";
import { isWeightSort, selectDevicePage } from "../../../../../features/measurements/devices/read.js";
import { loadDeviceDetails, toMeasurementDevice } from "../../../../../features/measurements/devices/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqQuery = { Querystring: MeasurementDeviceListQuery };

const schemaRoute = {
  summary: "List devices",
  description: "Your devices, revoked ones included. As an administrator you get everyone's with `scope=all`.",
  querystring: measurementDeviceListQuerySchema,
  response: { 200: measurementDeviceListSchema },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
  403: "Also returned when you send `scope=all`, `include=owner` or `sort=weight` and are not an administrator.",
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MeasurementDeviceList>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  res.header("Cache-Control", "private, no-store");
  const { scope, ids, userIds, sort, include, limit, cursor, includeTotal } = req.query;
  const includesOwner = include?.includes("owner") ?? false;
  const listsEveryone = await coversEveryone(req, scope, ids !== undefined || userIds !== undefined);
  if ((includesOwner || isWeightSort(sort)) && !(await canManageMeasurements(req))) throw new ErrorResponse("FORBIDDEN");

  const filters = and(
    listsEveryone ? undefined : eq(devices.userId, userId),
    ids ? inArray(devices.id, ids) : undefined,
    userIds ? inArray(devices.userId, userIds) : undefined,
  );
  const { keyset, query } = selectDevicePage(sort, cursor);
  const [rows, totals] = await Promise.all([
    query
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1),
    includeTotal ? db.select({ total: count() }).from(devices).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.id, key: last.sortKey }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  const details = await loadDeviceDetails(req, page, includesOwner);
  return res.send({ data: page.map((row) => toMeasurementDevice(row, details)), paging });
}

const getMeasurementDevices: Route<ReqQuery, MeasurementDeviceList> = {
  url: "/measurements/devices",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementDevices;

import { devices } from "@openbts/drizzle";
import { measurementDeviceListQuerySchema, measurementDeviceListSchema } from "@openbts/shared/contract";
import type { MeasurementDeviceList, MeasurementDeviceListQuery, Paging } from "@openbts/shared/contract";
import { and, count, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { canManageDevices, loadDeviceOwners, selectDevices, toMeasurementDevice } from "../../../../../features/measurements/devices.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { createKeyset } from "../../../../../lib/keyset.js";

type ReqQuery = { Querystring: MeasurementDeviceListQuery };

const SORT_COLUMNS = { createdAt: { column: devices.createdAt, kind: "instant" } } as const;

const schemaRoute = {
  summary: "List devices",
  description: "Your devices, revoked ones included.",
  querystring: measurementDeviceListQuerySchema,
  response: { 200: measurementDeviceListSchema },
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MeasurementDeviceList>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const { owners, sort, include, limit, cursor, includeTotal } = req.query;
  const includesOwner = include?.includes("owner") ?? false;
  if ((owners === "all" || includesOwner) && !(await canManageDevices(req))) throw new ErrorResponse("FORBIDDEN");

  const filters = owners === "all" ? undefined : eq(devices.userId, userId);
  const keyset = createKeyset(sort, devices.id, SORT_COLUMNS, cursor, z.uuid());
  const [rows, totals] = await Promise.all([
    selectDevices(keyset.key)
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1),
    includeTotal ? db.select({ total: count() }).from(devices).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.id, key: last.sortKey }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  const ownerRefs = includesOwner ? await loadDeviceOwners(page) : undefined;
  return res.send({ data: page.map((row) => toMeasurementDevice(row, ownerRefs)), paging });
}

const getMeasurementDevices: Route<ReqQuery, MeasurementDeviceList> = {
  url: "/measurements/devices",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementDevices;

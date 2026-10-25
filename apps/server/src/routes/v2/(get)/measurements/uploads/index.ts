import { devices, uploads } from "@openbts/drizzle";
import { measurementUploadListQuerySchema, measurementUploadListSchema } from "@openbts/shared/contract";
import type { MeasurementUploadList, MeasurementUploadListQuery, Paging } from "@openbts/shared/contract";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { canManageMeasurements, coversEveryone } from "../../../../../features/measurements/access.js";
import { loadCrowdSettings } from "../../../../../features/measurements/settings.js";
import { selectUploads } from "../../../../../features/measurements/uploads/read.js";
import { toMeasurementUploads } from "../../../../../features/measurements/uploads/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { createKeyset } from "../../../../../lib/keyset.js";

type ReqQuery = { Querystring: MeasurementUploadListQuery };

const SORT_COLUMNS = {
  receivedAt: { column: uploads.receivedAt, kind: "instant" },
  updatedAt: { column: uploads.statusChangedAt, kind: "instant" },
} as const;

const schemaRoute = {
  summary: "List uploads",
  description: "Your uploads, withdrawn ones included. To follow what processing does with them, ask again with `updatedAfter`.",
  querystring: measurementUploadListQuerySchema,
  response: { 200: measurementUploadListSchema },
};
const errorReasons = {
  403: "Also returned when you send `scope=all` or `include=uploader` and are not an administrator.",
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MeasurementUploadList>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const { scope, userIds, deviceIds, statuses, receivedAfter, updatedAfter, sort, include, limit, cursor, includeTotal } = req.query;
  const listsEveryone = await coversEveryone(req, scope, userIds !== undefined || deviceIds !== undefined);
  if (include?.includes("uploader") && !(await canManageMeasurements(req))) throw new ErrorResponse("FORBIDDEN");

  const filters = and(
    listsEveryone ? undefined : eq(devices.userId, userId),
    userIds ? inArray(devices.userId, userIds) : undefined,
    deviceIds ? inArray(uploads.deviceId, deviceIds) : undefined,
    statuses ? inArray(uploads.status, statuses) : undefined,
    receivedAfter ? gte(uploads.receivedAt, new Date(receivedAfter)) : undefined,
    updatedAfter ? gte(uploads.statusChangedAt, new Date(updatedAfter)) : undefined,
  );
  const keyset = createKeyset(sort, uploads.id, SORT_COLUMNS, cursor, z.uuid());
  const [rows, totals, settings] = await Promise.all([
    selectUploads(keyset.key)
      .where(and(filters, keyset.after))
      .orderBy(...keyset.orderBy)
      .limit(limit + 1),
    includeTotal ? db.select({ total: count() }).from(uploads).innerJoin(devices, eq(devices.id, uploads.deviceId)).where(filters) : null,
    loadCrowdSettings(),
  ]);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const paging: Paging = { limit, nextCursor: rows.length > limit && last ? keyset.cursorAfter({ id: last.upload.id, key: last.sortKey }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({ data: await toMeasurementUploads(req, page, settings.rawRetentionDays, include), paging });
}

const getMeasurementUploads: Route<ReqQuery, MeasurementUploadList> = {
  url: "/measurements/uploads",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMeasurementUploads;

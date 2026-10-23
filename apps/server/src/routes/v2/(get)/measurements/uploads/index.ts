import { devices, uploads } from "@openbts/drizzle";
import { measurementUploadListQuerySchema, measurementUploadListSchema } from "@openbts/shared/contract";
import type { MeasurementUploadList, MeasurementUploadListQuery, Paging } from "@openbts/shared/contract";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { ErrorResponse } from "../../../../../errors.js";
import { canManageDevices } from "../../../../../features/measurements/devices.js";
import { loadCrowdSettings } from "../../../../../features/measurements/settings.js";
import { selectUploads, toMeasurementUpload } from "../../../../../features/measurements/uploads.js";
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
  description:
    "Your uploads, withdrawn ones included. To follow what processing does with them, set `updatedAfter` to the latest `updatedAt` you have seen.",
  querystring: measurementUploadListQuerySchema,
  response: { 200: measurementUploadListSchema },
};

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MeasurementUploadList>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const { uploaders, deviceIds, statuses, receivedAfter, updatedAfter, sort, limit, cursor, includeTotal } = req.query;
  if (uploaders === "all" && !(await canManageDevices(req))) throw new ErrorResponse("FORBIDDEN");

  const filters = and(
    uploaders === "all" ? undefined : eq(devices.userId, userId),
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

  return res.send({ data: page.map((row) => toMeasurementUpload(row.upload, settings.rawRetentionDays)), paging });
}

const getMeasurementUploads: Route<ReqQuery, MeasurementUploadList> = {
  url: "/measurements/uploads",
  method: "GET",
  config: { permissions: ["upload:observations"], callers: ["app", "session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementUploads;

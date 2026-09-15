import { AUDIT_ENTITIES, AUDIT_OPERATION_KINDS, AUDIT_OPS } from "@openbts/shared/audit";
import type { AuditEntity, AuditOp, AuditOperationKind } from "@openbts/shared/audit";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { fetchAuditOperations } from "../../../../services/audit/read.js";
import { auditOperationSummarySchema } from "../../../../services/audit/schemas.js";
import type { AuditOperationSummary } from "../../../../services/audit/types.js";

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    sort: z.enum(["asc", "desc"]).default("desc"),
    kinds: z.string().optional(),
    entities: z.string().optional(),
    ops: z.string().optional(),
    user_ids: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    station_id: z.coerce.number().int().positive().optional(),
    q: z.string().max(100).optional(),
  }),
  response: {
    200: z.object({ data: z.array(auditOperationSummarySchema), totalCount: z.number() }),
  },
};

type Query = z.infer<typeof schemaRoute.querystring>;
type RequestData = { Querystring: Query };
type ResponseBody = { data: AuditOperationSummary[]; totalCount: number };

function parseCsv<T extends string>(value: string | undefined, allowed: readonly T[], field: string): T[] {
  if (value === undefined || value === "") return [];
  const allowedSet = new Set<string>(allowed);
  const parsed = [...new Set(value.split(",").filter(Boolean))];
  if (parsed.some((item) => !allowedSet.has(item))) throw new ErrorResponse("BAD_REQUEST", { message: `Invalid ${field} filter` });
  return parsed as T[];
}

function parseUserIds(value: string | undefined): string[] {
  if (value === undefined || value === "") return [];
  const parsed = z.array(z.uuid()).safeParse([...new Set(value.split(",").filter(Boolean))]);
  if (!parsed.success) throw new ErrorResponse("BAD_REQUEST", { message: "Invalid user_ids filter" });
  return parsed.data;
}

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const query = req.query;
  const result = await fetchAuditOperations({
    limit: query.limit,
    offset: query.offset,
    sort: query.sort,
    kinds: parseCsv<AuditOperationKind>(query.kinds, AUDIT_OPERATION_KINDS, "kinds"),
    entities: parseCsv<AuditEntity>(query.entities, AUDIT_ENTITIES, "entities"),
    ops: parseCsv<AuditOp>(query.ops, AUDIT_OPS, "ops"),
    userIds: parseUserIds(query.user_ids),
    from: query.from,
    to: query.to,
    stationId: query.station_id,
    query: query.q,
  });
  return res.send(result);
}

const getAuditOperations: Route<RequestData, ResponseBody> = {
  url: "/audit-operations",
  method: "GET",
  config: {
    permissions: ["read:audit_operations"],
  },
  schema: schemaRoute,
  handler,
};

export default getAuditOperations;

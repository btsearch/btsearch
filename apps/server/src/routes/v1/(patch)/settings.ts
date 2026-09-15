import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { settingsDataSchema } from "../(get)/settings.js";
import type { ReplyPayload } from "../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../interfaces/routes.interface.js";
import { auditContextFromRequest, runAuditedOperation } from "../../../services/audit/index.js";
import { type RuntimeSettings, getRuntimeSettings, updateRuntimeSettings } from "../../../services/settings.service.js";

type ReqBody = { Body: Partial<RuntimeSettings> };
type Response = RuntimeSettings;

const schemaRoute = {
  body: z
    .object({
      enforceAuthForAllRoutes: z.boolean().optional(),
      allowedUnauthenticatedRoutes: z.array(z.string().regex(/^\/api\/v1\/.+/, "Must be a specific path under /api/v1/")).optional(),
      disabledRoutes: z.array(z.string().regex(/^\/api\/v1\/.+/, "Must be a specific path under /api/v1/")).optional(),
      enableStationComments: z.boolean().optional(),
      submissionsEnabled: z.boolean().optional(),
      commentQueueEnabled: z.boolean().optional(),
      enableUserLists: z.boolean().optional(),
      photosEnabled: z.boolean().optional(),
      announcement: z
        .object({
          message: z.string(),
          enabled: z.boolean(),
          type: z.enum(["info", "warning", "error"]),
        })
        .optional(),
    })
    .strict(),
  response: {
    200: z.object({ data: settingsDataSchema }),
  },
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Response>>) {
  const patch = req.body;
  const oldSettings = getRuntimeSettings();
  const updated = await runAuditedOperation(auditContextFromRequest(req), { kind: "settings.update" }, async (_tx, audit) => {
    const result = await updateRuntimeSettings(patch);
    await audit.log({ entity: "settings", op: "update", recordId: null, old: oldSettings, new: result });
    return result;
  });
  res.send({ data: updated });
}

const patchSettings: Route<ReqBody, Response> = {
  url: "/settings",
  method: "PATCH",
  schema: schemaRoute,
  config: {
    permissions: ["update:settings"],
  },
  handler,
};

export default patchSettings;

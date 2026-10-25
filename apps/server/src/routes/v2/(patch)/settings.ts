import { settingsConflictSchema, settingsSchema, settingsUpdateSchema } from "@openbts/shared/contract";
import type { Settings, SettingsUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../errors.js";
import { standaloneAuditContext } from "../../../features/audit/index.js";
import { toSettingsMeasurements } from "../../../features/measurements/settings.js";
import { toRuntimeSettingsPatch, toSettings } from "../../../features/settings/serialize.js";
import { updateSettings } from "../../../features/settings/update.js";
import type { ReplyPayload } from "../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update the site settings",
  body: settingsUpdateSchema,
  response: {
    200: z.object({
      data: settingsSchema,
    }),
  },
};
const errorReasons = {
  400:
    "An entry in `access` does not match any route, " +
    "or `access.disabledRoutes` would disable the sign-in routes, the settings routes or the health check.",
  409:
    "`busy` when another change to the settings is being saved right now. " +
    "`noEstimate` when no site has an estimate of the `measurements.publishedAlgorithmVersion` you sent.",
};
const errorBodies = {
  409: z.object({
    errors: z.array(z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(settingsConflictSchema) })).min(1),
  }),
};
type ReqBody = { Body: SettingsUpdate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Settings>>) {
  try {
    const { runtime, crowd } = await updateSettings(standaloneAuditContext(req), toRuntimeSettingsPatch(req.body), req.body.measurements);

    return res.send({ data: { ...toSettings(runtime, { isAdministrator: true }), measurements: toSettingsMeasurements(crowd) } });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }
}

const patchSettings: Route<ReqBody, Settings> = {
  url: "/settings",
  method: "PATCH",
  config: {
    permissions: ["update:settings"],
    errorBodies,
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default patchSettings;

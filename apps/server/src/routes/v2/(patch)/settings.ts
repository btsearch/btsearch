import { settingsSchema, settingsUpdateSchema } from "@openbts/shared/contract";
import type { Settings, SettingsUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../errors.js";
import { standaloneAuditContext } from "../../../features/audit/index.js";
import { toRuntimeSettingsPatch, toSettings } from "../../../features/settings/serialize.js";
import { updateSettings } from "../../../features/settings/update.js";
import type { ReplyPayload } from "../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Update the site settings",
  description:
    "Updates the settings you send and leaves the rest unchanged. " +
    "The response contains all settings as an administrator sees them, including `access`. " +
    "Every entry in `access` has to match an existing route, and `access.disabledRoutes` cannot cover the sign-in routes, " +
    "the settings routes or the health check.",
  body: settingsUpdateSchema,
  response: {
    200: z.object({
      data: settingsSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request is invalid, an entry in `access` does not match any route, " +
    "or `access.disabledRoutes` would disable the sign-in routes, the settings routes or the health check.",
  409: "Another change to the settings is being saved right now. Try again in a moment.",
};
type ReqBody = { Body: SettingsUpdate };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<Settings>>) {
  try {
    const updated = await updateSettings(standaloneAuditContext(req), toRuntimeSettingsPatch(req.body));

    return res.send({ data: toSettings(updated, { isAdministrator: true }) });
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
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default patchSettings;

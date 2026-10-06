import { settingsSchema } from "@openbts/shared/contract";
import type { Settings } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { toSettings } from "../../../features/settings/serialize.js";
import { canUpdateSettings } from "../../../features/settings/update.js";
import type { ReplyPayload } from "../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Get the site settings",
  description:
    "Returns the site-wide settings. " +
    "This endpoint stays open to guests even when sign-in is required everywhere, and it cannot be disabled. " +
    "Everyone gets `isSignInRequired`, `features` and the `announcement` if it is enabled. " +
    "Administrators signed in with a session cookie also get `access`, and the `announcement` even if it is not enabled. " +
    "With an API key or an OAuth token, an administrator gets the same response as everyone else.",
  querystring: z.object({}).strict(),
  response: {
    200: z.object({
      data: settingsSchema,
    }),
  },
};
const errorReasons = {
  401: "Only returned when the token or publishable key you sent is invalid.",
  403:
    "Only returned when your API key is invalid, " +
    "or when your OAuth token belongs to an account that still has to set up two-factor authentication.",
};

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<Settings>>) {
  const isAdministrator = await canUpdateSettings(req);

  res.header("Cache-Control", "private, no-store");
  return res.send({ data: toSettings(getRuntimeSettings(), { isAdministrator }) });
}

const getSettings: Route<RouteGenericInterface, Settings> = {
  url: "/settings",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getSettings;

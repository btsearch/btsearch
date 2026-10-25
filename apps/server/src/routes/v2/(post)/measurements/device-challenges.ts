import { deviceChallengeSchema } from "@openbts/shared/contract";
import type { DeviceChallenge } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { issueDeviceChallenge } from "../../../../features/measurements/devices/challenges.js";
import { assertMeasurementUploadsEnabled } from "../../../../features/measurements/settings.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Ask for a device registration challenge",
  description:
    "Create the device's key with `challenge` as its attestation challenge, then register it with `POST /measurements/devices` before `expiresAt`. " +
    "A challenge is only for the account and the app that asked for it. Once a registration uses it, it only works with that registration's " +
    "`publicKey`, so you can send the registration again, but not with another key.",
  response: {
    200: z.object({
      data: deviceChallengeSchema,
    }),
  },
};
const errorReasons = { 403: "Also returned while uploads are switched off." };

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<DeviceChallenge>>) {
  assertMeasurementUploadsEnabled();
  const userId = req.userSession?.user.id;
  const clientId = req.oauthToken?.clientId;
  if (userId === undefined || clientId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  return res.send({ data: await issueDeviceChallenge(userId, clientId) });
}

const createDeviceChallenge: Route<RouteGenericInterface, DeviceChallenge> = {
  url: "/measurements/device-challenges",
  method: "POST",
  config: { permissions: ["upload:observations"], callers: ["app"], idempotentReplay: false, errorReasons },
  schema: schemaRoute,
  handler,
};

export default createDeviceChallenge;

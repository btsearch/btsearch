import { measurementDeviceCreateSchema, measurementDeviceSchema } from "@openbts/shared/contract";
import type { MeasurementDevice, MeasurementDeviceCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { toMeasurementDevice } from "../../../../../features/measurements/devices.js";
import { registerDevice } from "../../../../../features/measurements/registration.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { UNLIMITED, countAgainstLimit } from "../../../../../lib/requestLimit.js";
import type { RouteRateLimit } from "../../../../../plugins/ratelimit/rateLimiter.js";

type ReqBody = { Body: MeasurementDeviceCreate };

const REGISTRATION_LIMIT: RouteRateLimit = { url: "measurement-device-registration", max: 10, window: 3600, roles: { admin: UNLIMITED } };

const deviceResponseSchema = z.object({ data: measurementDeviceSchema });
const schemaRoute = {
  summary: "Register a device",
  description:
    "Answers 201 with the new device. Sending a `publicKey` you already registered answers 200 with that device, so a registration whose answer was lost can be sent again. " +
    "The key's attestation decides the device's `tier`.",
  body: measurementDeviceCreateSchema,
  response: { 200: deviceResponseSchema, 201: deviceResponseSchema },
};
const errorReasons = {
  400: "`challenge` is unknown, expired, another account's or used by another key; `challengeSignature` does not verify; or `certificateChain` is broken or attests another challenge or key.",
  403:
    "Also returned while uploads are switched off, with `APP_UPDATE_REQUIRED` when `app.versionCode` is below `minAppVersionCode`, " +
    "with `TERMS_NOT_ACCEPTED` until you accept the current terms, and with `CONTRIBUTOR_BLOCKED`, whose `details` holds one `{ until }`: " +
    "when the block ends, or `null` if it has no end.",
  409:
    "With `DEVICE_KEY_IN_USE`, the key is registered to another account, so start again with a new challenge and a new key. " +
    "With `PHONE_IN_USE`, a device of another account, revoked or not, has the same `phoneId`: a phone belongs to one account until that account is deleted. " +
    "With `DEVICE_LIMIT_REACHED`, you already have `activeDevices` devices that are not revoked.",
  429: `With \`DEVICE_REGISTRATION_LIMIT_REACHED\` after \`registrationsPerDay\` registrations in 24 hours, or after ${REGISTRATION_LIMIT.max} attempts in an hour.`,
};

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<MeasurementDevice>>) {
  const userId = req.userSession?.user.id;
  const clientId = req.oauthToken?.clientId;
  if (userId === undefined || clientId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const { device, isNew } = await registerDevice(res, userId, clientId, req.body, () => countAgainstLimit(req, res, REGISTRATION_LIMIT));
  return res.status(isNew ? 201 : 200).send({ data: toMeasurementDevice(device) });
}

const registerMeasurementDevice: Route<ReqBody, MeasurementDevice> = {
  url: "/measurements/devices",
  method: "POST",
  config: { permissions: ["upload:observations"], callers: ["app"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default registerMeasurementDevice;

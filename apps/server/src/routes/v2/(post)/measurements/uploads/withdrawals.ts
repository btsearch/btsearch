import { measurementWithdrawalResultSchema, measurementWithdrawalSchema } from "@openbts/shared/contract";
import type { MeasurementWithdrawal, MeasurementWithdrawalResult } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { ErrorResponse } from "../../../../../errors.js";
import { withdrawUploads } from "../../../../../features/measurements/uploads/withdrawals.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqBody = { Body: MeasurementWithdrawal };

const schemaRoute = {
  summary: "Withdraw several uploads",
  description: "Excluded uploads are left as they are. Works while uploads are switched off.",
  body: measurementWithdrawalSchema,
  response: { 200: measurementWithdrawalResultSchema },
};
const errorReasons = { 404: "An id in `uploadIds` is not one of your uploads. Nothing is withdrawn then." };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<MeasurementWithdrawalResult>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  return res.send({ data: { withdrawnCount: await withdrawUploads(userId, req.body) } });
}

const withdrawMeasurementUploads: Route<ReqBody, MeasurementWithdrawalResult> = {
  url: "/measurements/uploads/withdrawals",
  method: "POST",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default withdrawMeasurementUploads;

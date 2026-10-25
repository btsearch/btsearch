import {
  MEASUREMENT_CONTENT_TYPES,
  measurementUploadHeadersSchema,
  measurementUploadParamsSchema,
  measurementUploadSchema,
} from "@openbts/shared/contract";
import type { MeasurementUpload, MeasurementUploadHeaders } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { receiveUpload } from "../../../../../features/measurements/uploads/intake.js";
import { toMeasurementUpload } from "../../../../../features/measurements/uploads/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type RequestData = { Params: z.infer<typeof measurementUploadParamsSchema>; Headers: MeasurementUploadHeaders };

const uploadResponseSchema = z.object({ data: measurementUploadSchema });
const schemaRoute = {
  summary: "Upload a batch of measurements",
  description:
    "The body is a `MeasurementBatch` document, compressed with zstd or gzip. Sign these lines, joined by `\\n`, with the device key: " +
    "`btsearch-measurements-v1`, `PUT /api/v2/measurements/uploads/<id>`, the device id, the content type without parameters, " +
    "and the SHA-256 of the body in base64url. Ids and the content type are in lowercase. " +
    "Answers 201 once the upload is stored. Sending the same bytes again answers 200 with the upload's current state, " +
    "even while uploads are switched off or after the device was revoked, so keep the compressed body, not only the batch, until you get either.",
  params: measurementUploadParamsSchema,
  headers: measurementUploadHeadersSchema.loose(),
  response: { 200: uploadResponseSchema, 201: uploadResponseSchema },
};
const errorReasons = {
  400: "The body does not start like its content type.",
  403:
    "Also returned while uploads are switched off, with `APP_UPDATE_REQUIRED`, `TERMS_NOT_ACCEPTED`, `CONTRIBUTOR_BLOCKED` or `DEVICE_REVOKED`, " +
    "and with `INVALID_SIGNATURE` when `X-Device-Signature` does not verify. With `CONTRIBUTOR_BLOCKED`, `details` holds one `{ endsAt }`: " +
    "when the block ends, or `null` if it has no end.",
  404: "With `DEVICE_NOT_FOUND`, `X-Device-Id` is not one of your devices, so register the phone again with a new key. Otherwise the upload is someone else's.",
  409: "An upload with this id exists from another device or with another body (`UPLOAD_ID_CONFLICT`).",
  429: "With `MEASUREMENT_QUOTA_EXCEEDED`, `details` holds one `{ quota }`: `uploads`, `bytes` or `deviceUploads`.",
  503: "Storage is full, or the upload could not be stored. Send the same body again after `Retry-After`.",
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementUpload>>) {
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  const intake = await receiveUpload(res, userId, {
    uploadId: req.params.id,
    headers: req.headers,
    contentTypeHeader: req.headers["content-type"],
    raw: req.raw,
  });
  return res.status(intake.isNew ? 201 : 200).send({ data: await toMeasurementUpload(req, intake, intake.retentionDays) });
}

const putMeasurementUpload: Route<RequestData, MeasurementUpload> = {
  url: "/measurements/uploads/:id",
  method: "PUT",
  config: { permissions: ["upload:observations"], callers: ["app"], errorReasons, rawBodyTypes: MEASUREMENT_CONTENT_TYPES },
  schema: schemaRoute,
  handler,
};

export default putMeasurementUpload;

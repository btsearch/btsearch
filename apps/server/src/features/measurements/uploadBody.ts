import { MEASUREMENT_CONTENT_TYPES, type MeasurementContentType } from "@openbts/shared/contract";
import { type FastifyInstance, errorCodes } from "fastify";
import type { IncomingMessage } from "node:http";

import { ValidationError } from "../../errors.js";

const MAGIC_BYTES: Record<MeasurementContentType, Buffer> = {
  "application/zstd": Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
  "application/gzip": Buffer.from([0x1f, 0x8b]),
};

export function registerUnreadBodyParsers(app: FastifyInstance): void {
  app.addContentTypeParser([...MEASUREMENT_CONTENT_TYPES], (_req, _payload, done) => done(null));
}

export function readContentType(header: string | undefined): MeasurementContentType {
  const type = header?.split(";")[0]?.trim().toLowerCase() ?? "";
  const contentType = MEASUREMENT_CONTENT_TYPES.find((candidate) => candidate === type);
  if (contentType === undefined) throw new errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE(type);
  return contentType;
}

export function readRequestBody(raw: IncomingMessage, maxBytes: number): Promise<Buffer> {
  if (Number(raw.headers["content-length"]) > maxBytes) return Promise.reject(new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE());

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const stop = () => {
      raw.off("data", onData);
      raw.off("end", onEnd);
      raw.off("error", fail);
      raw.off("aborted", onClosedEarly);
      raw.off("close", onClosedEarly);
    };
    const fail = (error: Error) => {
      stop();
      reject(error);
    };
    const onClosedEarly = () => fail(new Error("The client closed the connection before sending the whole upload"));
    const onEnd = () => {
      stop();
      resolve(Buffer.concat(chunks));
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) fail(new errorCodes.FST_ERR_CTP_BODY_TOO_LARGE());
      else chunks.push(chunk);
    };

    raw.on("data", onData);
    raw.once("end", onEnd);
    raw.once("error", fail);
    raw.once("aborted", onClosedEarly);
    raw.once("close", onClosedEarly);
  });
}

export function assertBodyIs(contentType: MeasurementContentType, body: Buffer): void {
  const magicBytes = MAGIC_BYTES[contentType];
  if (!body.subarray(0, magicBytes.length).equals(magicBytes)) {
    throw new ValidationError([{ field: "body", validationMessage: `Does not start like ${contentType}` }]);
  }
}

import { type JsonObject, type JsonValue, fromJson, toBinary } from "@bufbuild/protobuf";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ResponseSerializationError } from "fastify-type-provider-zod";
import { $ZodType, safeEncode } from "zod/v4/core";

const PROTOBUF_CONTENT_TYPE = "application/x-protobuf";

function getResponseSchema(req: FastifyRequest, statusCode: number): $ZodType | undefined {
  const response = req.routeOptions.schema?.response;
  if (typeof response !== "object" || response === null) return undefined;

  const schemas = response as Record<string, unknown>;
  const statusGroup = `${Math.trunc(statusCode / 100)}xx`;
  const schema = schemas[String(statusCode)] ?? schemas[statusGroup] ?? schemas.default;

  return schema instanceof $ZodType ? schema : undefined;
}

function isNonSerializableJsonValue(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (value instanceof Date) return value.toJSON();

  if (Array.isArray(value))
    return value.map((item) => {
      if (isNonSerializableJsonValue(item)) return null;
      return toJsonValue(item);
    });

  if (typeof value !== "object") throw new TypeError(`Unsupported protobuf JSON value: ${typeof value}`);

  const result: JsonObject = {};

  for (const [key, item] of Object.entries(value)) {
    if (isNonSerializableJsonValue(item)) continue;
    result[key] = toJsonValue(item);
  }

  return result;
}

function addVaryAccept(res: FastifyReply): void {
  const current = res.getHeader("vary");
  let values: (number | string)[];
  if (current === undefined) values = [];
  else if (Array.isArray(current)) values = current;
  else values = [current];

  const tokens = values
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (!tokens.some((value) => value.toLowerCase() === "accept")) tokens.push("Accept");
  res.header("vary", tokens.join(", "));
}

export async function PreSerializationHook(req: FastifyRequest, res: FastifyReply, payload: unknown): Promise<unknown> {
  const protoSchema = res.routeOptions.config.proto;
  if (protoSchema === undefined || res.statusCode >= 400) return payload;

  addVaryAccept(res);
  if (req.headers.accept !== PROTOBUF_CONTENT_TYPE) return payload;

  const responseSchema = getResponseSchema(req, res.statusCode);
  const routeUrl = req.routeOptions.url ?? req.url;
  if (responseSchema === undefined) throw new Error(`Missing response schema for ${req.method} ${routeUrl}`);

  const encodedPayload = safeEncode(responseSchema, payload);
  if (!encodedPayload.success) throw new ResponseSerializationError(req.method, routeUrl, { cause: encodedPayload.error });

  const message = fromJson(protoSchema, toJsonValue(encodedPayload.data));
  const bytes = Buffer.from(toBinary(protoSchema, message));

  res.type(PROTOBUF_CONTENT_TYPE);
  res.serializer((value) => value);

  return bytes;
}

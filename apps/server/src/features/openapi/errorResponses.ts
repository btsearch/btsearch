import type { FastifyContextConfig, RouteOptions } from "fastify";
import type { z } from "zod/v4";

import { IDEMPOTENCY_LOCK_SECONDS } from "../../constants.js";
import { errors } from "../../errors.js";
import { type Json, type JsonObject, isJsonObject } from "./json.js";

export type DocumentedErrorStatus = (typeof DOCUMENTED_ERROR_STATUSES)[number];
export type ErrorReasons = Partial<Record<DocumentedErrorStatus, string | null>>;
export type ErrorBodies = Partial<Record<DocumentedErrorStatus, z.ZodType>>;
export type ErrorPlan = { [status: string]: string | null };

type ErrorExample = { code: string; message: string };
type ResponseHeader = { description: string; schema: { type: "integer" } };

const DOCUMENTED_ERROR_STATUSES = [400, 401, 403, 404, 409, 413, 415, 429, 500, 503] as const;
const API_ERROR_REFERENCE = "#/components/schemas/ApiError";
const API_ERROR_CONTENT: JsonObject = { "application/json": { schema: { $ref: API_ERROR_REFERENCE } } };
const METHODS_WITHOUT_BODY: ReadonlySet<string> = new Set(["GET", "HEAD"]);
const REPEATED_POST_NOTE = "Also returned when a POST is repeated with an `X-Idempotency-Key` that is still being processed.";
const RETAINED_KEY_NOTE = `Also returned when the same \`X-Idempotency-Key\` was used within the last ${IDEMPOTENCY_LOCK_SECONDS} seconds.`;

const RESPONSE_NAMES: Record<DocumentedErrorStatus, string> = {
  400: "BadRequest",
  401: "Unauthorized",
  403: "Forbidden",
  404: "NotFound",
  409: "Conflict",
  413: "PayloadTooLarge",
  415: "UnsupportedMediaType",
  429: "TooManyRequests",
  500: "InternalServerError",
  503: "ServiceUnavailable",
};

const RESPONSE_DESCRIPTIONS: Record<DocumentedErrorStatus, string> = {
  400: "The request is invalid: a path parameter, a query parameter or the body did not pass validation. `details` lists the fields that failed.",
  401: "You are not signed in, or the token or publishable key you sent is invalid.",
  403:
    "You are not allowed to do this. A permission is missing, the API key is invalid, your editor access does not cover this country " +
    "or region, two-factor authentication still has to be set up, or the endpoint is disabled.",
  404: "The resource does not exist, or it belongs to a country you cannot access.",
  409: "A POST with the same `X-Idempotency-Key` is still being processed, or the request conflicts with the current data.",
  413: "The request body is too large.",
  415: "The `Content-Type` of the request body is not supported by this endpoint.",
  429:
    "You are sending too many requests, or the weekly quota of your API key is used up. " +
    "When `X-Retry-After` is present, it tells you how many seconds to wait.",
  500: "Something went wrong on the server. The details are logged, not returned.",
  503: "The site is in maintenance mode, or a service this endpoint depends on is not responding right now. Try again later.",
};

const GUEST_REASONS: ErrorReasons = {
  401: "Only returned when the token or publishable key you sent is invalid, or when the site requires signing in for everything.",
  403:
    "Only returned when your API key or token cannot be used for this endpoint, two-factor authentication still has to be set up, " +
    "or the endpoint is disabled.",
};

const PARSER_ERRORS: Partial<Record<DocumentedErrorStatus, ErrorExample[]>> = {
  400: [
    { code: "FST_ERR_CTP_INVALID_JSON_BODY", message: "Body is not valid JSON but content-type is set to 'application/json'" },
    { code: "FST_ERR_CTP_EMPTY_JSON_BODY", message: "Body cannot be empty when content-type is set to 'application/json'" },
  ],
  413: [{ code: "FST_ERR_CTP_BODY_TOO_LARGE", message: "Request body is too large" }],
  415: [{ code: "FST_ERR_CTP_INVALID_MEDIA_TYPE", message: "Unsupported Media Type" }],
};

const RETRY_AFTER_HEADER: ResponseHeader = {
  description: "The number of seconds to wait before retrying. Not sent when the server cannot tell",
  schema: { type: "integer" },
};
const RESPONSE_HEADERS: Partial<Record<DocumentedErrorStatus, Record<string, ResponseHeader>>> = {
  429: { "X-Retry-After": RETRY_AFTER_HEADER },
  503: { "Retry-After": RETRY_AFTER_HEADER, "X-Retry-After": RETRY_AFTER_HEADER },
};

export const API_ERROR_SCHEMA: JsonObject = {
  type: "object",
  description: "Every error response has this shape, whatever the status",
  required: ["errors"],
  properties: {
    errors: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", description: "A stable identifier for the kind of error, for example NOT_FOUND. Use this in your code" },
          message: { type: "string", description: "A human-readable explanation" },
          details: {
            type: "array",
            description: "Extra information that some errors include. Validation errors list the fields that failed",
            items: {
              type: "object",
              properties: {
                field: { type: "string", description: "The field that failed validation, as a path with `/` between its segments" },
                validationMessage: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

function examplesFor(status: DocumentedErrorStatus): ErrorExample[] {
  const defined = Object.entries(errors).flatMap(([code, { statusCode, message }]) => (statusCode === status ? [{ code, message }] : []));
  return [...defined, ...(PARSER_ERRORS[status] ?? [])];
}

function writtenOutResponse(status: DocumentedErrorStatus, description: string, content: JsonObject): JsonObject {
  const headers = RESPONSE_HEADERS[status];
  return headers ? { description, headers, content } : { description, content };
}

function sharedResponse(status: DocumentedErrorStatus): JsonObject {
  const examples = examplesFor(status);
  const codeIsOneOf = { properties: { errors: { items: { properties: { code: { enum: examples.map(({ code }) => code) } } } } } };
  return writtenOutResponse(status, RESPONSE_DESCRIPTIONS[status], {
    "application/json": {
      schema: { allOf: [{ $ref: API_ERROR_REFERENCE }, codeIsOneOf] },
      examples: Object.fromEntries(examples.map((example) => [example.code, { value: { errors: [example] } }])),
    },
  });
}

export function buildSharedErrorResponses(): JsonObject {
  return Object.fromEntries(DOCUMENTED_ERROR_STATUSES.map((status) => [RESPONSE_NAMES[status], sharedResponse(status)]));
}

function methodsOf({ method }: RouteOptions): string[] {
  return [method].flat().map((name) => name.toUpperCase());
}

function isPost(route: RouteOptions): boolean {
  return methodsOf(route).includes("POST");
}

function canCarryBody(route: RouteOptions): boolean {
  return methodsOf(route).some((name) => !METHODS_WITHOUT_BODY.has(name));
}

function derivedStatuses(route: RouteOptions, { multipartBody }: FastifyContextConfig): Record<DocumentedErrorStatus, boolean> {
  const { url, schema } = route;
  const takesJsonBody = schema?.body !== undefined;
  const takesBody = takesJsonBody || multipartBody !== undefined;

  return {
    400: canCarryBody(route) || schema?.params !== undefined || schema?.querystring !== undefined,
    401: true,
    403: true,
    404: url.includes(":"),
    409: isPost(route),
    413: takesJsonBody,
    415: takesBody,
    429: true,
    500: true,
    503: url !== "/settings" && url !== "/api/v2/settings",
  };
}

function withIdempotencyNote(reason: string, { retainIdempotencyKey = false }: FastifyContextConfig): string {
  const note = retainIdempotencyKey ? RETAINED_KEY_NOTE : REPEATED_POST_NOTE;
  return `${reason} ${note}`;
}

function reasonFor(status: DocumentedErrorStatus, route: RouteOptions, config: FastifyContextConfig): string | null {
  const { allowGuestAccess = false, errorReasons = {} } = config;
  const defaultReasons: ErrorReasons = allowGuestAccess ? GUEST_REASONS : {};
  const reason = errorReasons[status] ?? defaultReasons[status] ?? null;
  const isAlsoReturnedForRepeatedKey = status === 409 && isPost(route);

  return reason !== null && isAlsoReturnedForRepeatedKey ? withIdempotencyNote(reason, config) : reason;
}

export function planErrorResponses(route: RouteOptions, config: FastifyContextConfig): ErrorPlan {
  const { errorReasons = {}, errorBodies = {} } = config;
  const isDerived = derivedStatuses(route, config);
  const isNeverReturned = (status: DocumentedErrorStatus) => errorReasons[status] === null;
  const isNamedByRoute = (status: DocumentedErrorStatus) => errorReasons[status] !== undefined || errorBodies[status] !== undefined;

  const returned = DOCUMENTED_ERROR_STATUSES.filter((status) => !isNeverReturned(status) && (isDerived[status] || isNamedByRoute(status)));
  return Object.fromEntries(returned.map((status) => [status, reasonFor(status, route, config)]));
}

export function isErrorPlan(value: unknown): value is ErrorPlan {
  return isJsonObject(value) && Object.values(value).every((reason) => reason === null || typeof reason === "string");
}

function errorResponse(status: DocumentedErrorStatus, reason: string | null, declared: Json | undefined): JsonObject {
  const declaredContent = isJsonObject(declared) && isJsonObject(declared.content) ? declared.content : undefined;
  if (declaredContent === undefined && reason === null) return { $ref: `#/components/responses/${RESPONSE_NAMES[status]}` };

  return writtenOutResponse(status, reason ?? RESPONSE_DESCRIPTIONS[status], declaredContent ?? API_ERROR_CONTENT);
}

export function withErrorResponses(responses: JsonObject, plan: ErrorPlan): JsonObject {
  const planned = DOCUMENTED_ERROR_STATUSES.flatMap((status) => {
    const reason = plan[status];
    if (reason === undefined) return [];
    return [[String(status), errorResponse(status, reason, responses[status])] as const];
  });
  return { ...responses, ...Object.fromEntries(planned) };
}

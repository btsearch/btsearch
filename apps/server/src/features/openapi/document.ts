import type { FastifyDynamicSwaggerOptions, SwaggerTransform, SwaggerTransformObject } from "@fastify/swagger";
import { measurementBatchSchema } from "@openbts/shared/contract";
import type { FastifyContextConfig, FastifySchema, RouteOptions } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { baseUrl } from "../../config.js";
import { APP_NAME, IDEMPOTENCY_REPLAY_MAX_BYTES, IDEMPOTENCY_REPLAY_SECONDS } from "../../constants.js";
import { toDocumentedSchema } from "../../lib/documentedSchema.js";
import { withDiscriminators } from "./discriminators.js";
import { API_ERROR_SCHEMA, buildSharedErrorResponses, isErrorPlan, planErrorResponses, withErrorResponses } from "./errorResponses.js";
import { type Json, type JsonObject, isJsonObject } from "./json.js";
import { type OpenApiDocument, nameModels, toJsonModel } from "./models.js";
import { buildSecuritySchemes, securityFor } from "./security.js";
import { TAGS, TAG_GROUPS } from "./tags.js";

const OPENAPI_VERSION = "3.1.0";
const API_VERSION = "2.0.0";
const MULTIPART_CONTENT_TYPE = "multipart/form-data";
const ERROR_PLAN_KEY = "x-error-plan";
const PLUGIN_PLACEHOLDER_DESCRIPTION = "Default Response";
const SUCCESS_DESCRIPTIONS: Record<string, string> = { 200: "OK", 201: "Created", 204: "No content" };
const METHOD_ORDER = ["get", "post", "put", "patch", "delete"];
const STANDALONE_MODELS = { MeasurementBatch: measurementBatchSchema };
const SECONDS_PER_HOUR = 3600;
const BYTES_PER_KB = 1024;

const API_DESCRIPTION = [
  `Welcome to the ${APP_NAME} API! Everything you see on the site is available here: base stations, the locations they stand on, ` +
    "their cells, photos and more. Most of it can be read without an account, and with one you can contribute changes of your own.",
  "New here? `GET /stations` and `GET /search` are good places to start.",
  "## Authentication",
  "You can read public data without signing in, unless the site is set to require it. " +
    "For everything else, each endpoint lists the ways you can authenticate and the permissions it needs.",
  "- **Session cookie**: set by the site when you sign in.\n" +
    "- **API key**: sent in the `X-Api-Key` header. Keys are meant for reading public data.\n" +
    "- **OAuth access token**: issued to an application the user has approved, sent as `Authorization: Bearer <token>`.",
  "Sign-in, API keys and OAuth applications are managed through the endpoints under `/api/v1/auth`.",
  "## Maintenance",
  "When `isMaintenanceMode` on `GET /settings` is enabled, endpoints return 503 `MAINTENANCE_MODE` unless an administrator is signed in " +
    "with a session cookie. Sign-in, account recovery, the settings endpoints and the health check remain available.",
  "## Responses",
  "Successful responses wrap their payload in `data`. Paginated lists also return `paging`: " +
    "pass its `nextCursor` as `cursor` to get the next page, and stop when it is `null`. " +
    "A cursor only works with the `sort` it came from, and a leading `-` in `sort` means descending order. " +
    "Most lists also take `includeTotal=true`, which adds `paging.total`.",
  "Hidden countries and everything in them are left out unless you have access to them, " + "and asking for something in one by id gives 404.",
  "## Following changes",
  "Lists with `updatedAfter` return what changed at or after that time. A change can be recorded with a time slightly earlier than when you can see it, " +
    "so ask again from a minute before the latest `updatedAt` you have, and drop the rows you already hold.",
  "## Errors",
  "Errors always have the same shape: an `errors` array whose entries have a stable `code`, a human-readable `message` and " +
    "sometimes `details`. Rely on the status and the `code` in your code, not on the message.",
  "Every endpoint lists the errors it can return. Where an endpoint gives an error a reason of its own, the general reasons for that status " +
    "still apply and are not repeated there: a 400 can always be a field that did not pass validation, and a 403 a missing permission, " +
    "an invalid API key, editor access that does not cover the country or region, two-factor authentication that still has to be set up, " +
    "or an endpoint that has been disabled.",
  "Every response has an `X-Request-Id` header, except the public tiles and site lists the cache answers. " +
    "Quote it when you report an error, so the request can be found in the logs.",
  "## Tiles",
  "Tile endpoints answer Mapbox vector tiles (`application/vnd.mapbox-vector-tile`) with an extent of 256, addressed by `{z}/{x}/{y}` as web maps address them. " +
    "An empty tile is a 200 with an empty body. " +
    "Each tile endpoint has a TileJSON document that map libraries read as it is, so it is not wrapped in `data`.",
  "Public tiles come from a cache shared by everyone and can be up to an hour old, and your browser may show a copy up to a day old " +
    "while it fetches a new one. Requests with an API key always reach the server, so the key's quota and scope apply to them.",
  "## Rate limits",
  "Requests are rate limited. Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`. " +
    "API keys also have a weekly quota, reported in `X-Quota-Limit`, `X-Quota-Remaining` and " +
    "`X-Quota-Reset`. When you go over a limit you get a 429, and `X-Retry-After` tells you how many seconds to wait.",
  "## Idempotency",
  "Send an `X-Idempotency-Key` header with a POST, a new random value such as a UUID for each request, and you can safely retry it " +
    "when its response gets lost. A retry with the same key and the same request does not run again. " +
    "You get the first response back instead, with an `Idempotent-Replayed: true` header.",
  `Responses are kept for ${IDEMPOTENCY_REPLAY_SECONDS / SECONDS_PER_HOUR} hours. Server errors, 429s and responses larger than ` +
    `${IDEMPOTENCY_REPLAY_MAX_BYTES / BYTES_PER_KB} KB are not kept, so a retry after one of them runs again. ` +
    "`POST /cells/match`, `POST /terrain-profiles` and `POST /measurements/device-challenges` never keep their responses, " +
    "because running them again is safe. " +
    "While the first request is still being processed, a retry gets 409 `DUPLICATE_REQUEST`. " +
    "Reusing a key for a different request gets 422 `IDEMPOTENCY_KEY_REUSED`.",
  "A key is tied to you and to the path you sent it to. It needs a session, an API key or an OAuth token, and it is ignored on requests without one. " +
    "The same request means the same query and the same JSON body. The file of an upload is not compared.",
  "## Grouping requests in the audit log",
  "Every change is recorded in the audit log as an operation. When one action takes several requests, for example a new station " +
    "followed by its photos, send the same UUID in an `X-Audit-Operation-Id` header with each of them and they are recorded as one operation.",
  "Requests are grouped when the same signed-in user sends them within an hour and they belong together:",
  [
    "- changes to stations, locations, cells and their photos",
    "- a submission with its photos and its review",
    "- analyzer results applied in parts",
    "- a brand with its logo",
    "- a band with its band plan entries",
  ].join("\n"),
  "Anything else is recorded as an operation of its own, as it is without the header. " +
    "The header is optional and never makes a request fail. It is ignored on requests authenticated with an API key.",
].join("\n\n");

function categoryOf(routePath: string): string | undefined {
  return routePath.split("/").find(Boolean);
}

function declaredResponses(schema: FastifySchema): object {
  return typeof schema.response === "object" && schema.response !== null ? schema.response : {};
}

function withDocumentOnlyParts(schema: FastifySchema, { multipartBody, rawBodyTypes, errorBodies }: FastifyContextConfig): FastifySchema {
  const withErrorBodies = errorBodies ? { ...schema, response: { ...declaredResponses(schema), ...errorBodies } } : schema;
  if (multipartBody) return { ...withErrorBodies, consumes: [MULTIPART_CONTENT_TYPE], body: multipartBody };
  if (rawBodyTypes) return { ...withErrorBodies, consumes: [...rawBodyTypes], body: z.file() };
  return withErrorBodies;
}

function describeSuccess(status: string, response: Json): Json {
  const description = SUCCESS_DESCRIPTIONS[status];
  if (description === undefined || !isJsonObject(response) || response.description !== PLUGIN_PLACEHOLDER_DESCRIPTION) return response;
  return { ...response, description };
}

function withPathParametersFirst(operation: JsonObject): JsonObject {
  const { parameters } = operation;
  if (!Array.isArray(parameters)) return operation;

  const isPathParameter = (parameter: Json) => isJsonObject(parameter) && parameter.in === "path";
  return { ...operation, parameters: [...parameters.filter(isPathParameter), ...parameters.filter((parameter) => !isPathParameter(parameter))] };
}

function completeOperation(operation: Json): Json {
  if (!isJsonObject(operation)) return operation;

  const { [ERROR_PLAN_KEY]: errorPlan, ...operationWithoutPlan } = operation;
  const orderedOperation = withPathParametersFirst(operationWithoutPlan);
  const { responses } = orderedOperation;
  if (!isErrorPlan(errorPlan) || !isJsonObject(responses)) return orderedOperation;

  const describedResponses = Object.fromEntries(Object.entries(responses).map(([status, response]) => [status, describeSuccess(status, response)]));
  return { ...orderedOperation, responses: withErrorResponses(describedResponses, errorPlan) };
}

function completeOperationsInMethodOrder(pathItem: Json | undefined): Json {
  if (!isJsonObject(pathItem)) return {};

  const inMethodOrder = Object.entries(pathItem).sort(([a], [b]) => METHOD_ORDER.indexOf(a) - METHOD_ORDER.indexOf(b));
  return Object.fromEntries(inMethodOrder.map(([method, operation]) => [method, completeOperation(operation)]));
}

export function findDocumentationGap({ url, schema }: RouteOptions): string | undefined {
  if (schema?.hide) return undefined;
  if (!schema?.summary) return "it has no summary";

  const categories = schema.tags ?? [categoryOf(url) ?? ""];
  if (categories.length === 0) return "it has no category";

  const undescribed = categories.find((category) => !TAGS.some((tag) => tag.name === category));
  return undescribed === undefined ? undefined : `its category "${undescribed}" has no description`;
}

function toStandaloneModels(openapiObject: OpenApiDocument): JsonObject {
  return Object.fromEntries(
    Object.entries(STANDALONE_MODELS).flatMap(([name, model]) => {
      const schema = toJsonModel(model, "input", openapiObject);
      return schema ? [[name, schema]] : [];
    }),
  );
}

export function buildSwaggerOptions(prefix: string): FastifyDynamicSwaggerOptions {
  const baseDocument: OpenApiDocument = {
    openapi: OPENAPI_VERSION,
    info: { title: `${APP_NAME} API`, version: API_VERSION, description: API_DESCRIPTION },
    servers: [{ url: `${baseUrl}${prefix}`, description: "API v2 base path" }],
    tags: [...TAGS],
    components: { securitySchemes: buildSecuritySchemes(baseUrl) },
  };

  const transform: SwaggerTransform = (input) => {
    const { route } = input;
    const config = route.config ?? {};
    const converted = jsonSchemaTransform({ ...input, schema: withDocumentOnlyParts(input.schema, config) });
    if (!converted.schema || converted.schema.hide) return converted;

    const documented = toDocumentedSchema(converted.schema);
    const category = categoryOf(converted.url.slice(prefix.length));
    const schema = {
      ...documented,
      tags: documented.tags ?? (category ? [category] : []),
      security: documented.security ?? securityFor(config),
      [ERROR_PLAN_KEY]: planErrorResponses(route, config),
    };
    return { ...converted, schema };
  };

  const transformObject: SwaggerTransformObject = (documentObject) => {
    if ("swaggerObject" in documentObject) return documentObject.swaggerObject;

    const { openapiObject } = documentObject;
    const generatedPaths: JsonObject = isJsonObject(openapiObject.paths) ? openapiObject.paths : {};
    const sortedPaths = Object.fromEntries(
      Object.keys(generatedPaths)
        .sort()
        .map((path) => [path, completeOperationsInMethodOrder(generatedPaths[path])]),
    );
    const { paths, models } = nameModels(sortedPaths, openapiObject);
    const schemas = { ApiError: API_ERROR_SCHEMA, ...models, ...toStandaloneModels(openapiObject) };

    const document = {
      openapi: openapiObject.openapi,
      info: openapiObject.info,
      servers: openapiObject.servers,
      tags: openapiObject.tags,
      "x-tagGroups": TAG_GROUPS,
      paths: withDiscriminators(paths, schemas),
      components: {
        securitySchemes: openapiObject.components?.securitySchemes,
        responses: buildSharedErrorResponses(),
        schemas: withDiscriminators(schemas, schemas),
      },
    };
    return document as unknown as OpenApiDocument;
  };

  return { openapi: baseDocument, convertConstToEnum: false, transform, transformObject };
}

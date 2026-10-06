import type { FastifyDynamicSwaggerOptions, SwaggerTransform, SwaggerTransformObject } from "@fastify/swagger";
import type { FastifyContextConfig, FastifySchema, RouteOptions } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

import { baseUrl } from "../../config.js";
import { APP_NAME } from "../../constants.js";
import { toDocumentedSchema } from "../../lib/documentedSchema.js";
import { API_ERROR_SCHEMA, buildSharedErrorResponses, isErrorPlan, planErrorResponses, withErrorResponses } from "./errorResponses.js";
import { type Json, type JsonObject, isJsonObject } from "./json.js";
import { type OpenApiDocument, nameModels } from "./models.js";
import { buildSecuritySchemes, securityFor } from "./security.js";
import { TAGS, TAG_GROUPS } from "./tags.js";

const OPENAPI_VERSION = "3.1.0";
const API_VERSION = "2.0.0";
const MULTIPART_CONTENT_TYPE = "multipart/form-data";
const ERROR_PLAN_KEY = "x-error-plan";
const PLUGIN_PLACEHOLDER_DESCRIPTION = "Default Response";
const SUCCESS_DESCRIPTIONS: Record<string, string> = { 200: "OK", 201: "Created", 204: "No content" };
const METHOD_ORDER = ["get", "post", "put", "patch", "delete"];

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
  "## Responses",
  "Successful responses wrap their payload in `data`. Paginated lists also return `paging`: " +
    "pass its `nextCursor` as `cursor` to get the next page, and stop when it is `null`.",
  "## Errors",
  "Errors always have the same shape: an `errors` array whose entries have a stable `code`, a human-readable `message` and " +
    "sometimes `details`. Rely on the status and the `code` in your code, not on the message.",
  "Every endpoint lists the errors it can return. Where an endpoint gives a 403 a reason of its own, the general reasons still apply " +
    "and are not repeated there: a missing permission, an invalid API key, two-factor authentication that still has to be set up, " +
    "or an endpoint that has been disabled.",
  "## Rate limits",
  "Requests are rate limited. Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, " +
    "so you always know where you stand. API keys also have a weekly quota, reported in `X-Quota-Limit`, `X-Quota-Remaining` and " +
    "`X-Quota-Reset`. When you go over a limit you get a 429, and `X-Retry-After` tells you how many seconds to wait.",
  "## Idempotency",
  "If you send an `X-Idempotency-Key` header with a POST, a second POST with the same key is rejected with 409 `DUPLICATE_REQUEST` " +
    "while the first one is still being processed. That protects you from double clicks and from retries that arrive too early.",
  "## Grouping requests in the audit log",
  "Every change is recorded in the audit log as an operation. When one action takes several requests, for example a new station " +
    "followed by its photos, send the same UUID in an `X-Audit-Operation-Id` header with each of them and they are recorded as one operation.",
  "Requests are grouped when the same signed-in user sends them within an hour and they belong together: " +
    "changes to stations, locations, cells and their photos; a submission with its photos and its review; analyzer results applied in parts; " +
    "a brand with its logo; a band with its band plan entries. Anything else is recorded as an operation of its own, as it is without the header. " +
    "The header is optional and never makes a request fail. It is ignored on requests authenticated with an API key.",
].join("\n\n");

function categoryOf(routePath: string): string | undefined {
  return routePath.split("/").find(Boolean);
}

function declaredResponses(schema: FastifySchema): object {
  return typeof schema.response === "object" && schema.response !== null ? schema.response : {};
}

function withDocumentOnlyParts(schema: FastifySchema, { multipartBody, errorBodies }: FastifyContextConfig): FastifySchema {
  const withErrorBodies = errorBodies ? { ...schema, response: { ...declaredResponses(schema), ...errorBodies } } : schema;
  return multipartBody ? { ...withErrorBodies, consumes: [MULTIPART_CONTENT_TYPE], body: multipartBody } : withErrorBodies;
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

    const document = {
      openapi: openapiObject.openapi,
      info: openapiObject.info,
      servers: openapiObject.servers,
      tags: openapiObject.tags,
      "x-tagGroups": TAG_GROUPS,
      paths,
      components: {
        securitySchemes: openapiObject.components?.securitySchemes,
        responses: buildSharedErrorResponses(),
        schemas: { ApiError: API_ERROR_SCHEMA, ...models },
      },
    };
    return document as unknown as OpenApiDocument;
  };

  return { openapi: baseDocument, convertConstToEnum: false, transform, transformObject };
}

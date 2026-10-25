import type { SwaggerTransform, SwaggerTransformObject } from "@fastify/swagger";
import { observationFlagSchema, observedCellRecordSchema, observedSitePlacementSchema, observedSiteSchema } from "@openbts/shared/contract";
import type { RouteOptions } from "fastify";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { withDiscriminators } from "../../../src/features/openapi/discriminators.js";
import { buildSwaggerOptions } from "../../../src/features/openapi/document.js";
import { type Json, type JsonObject, isJsonObject } from "../../../src/features/openapi/json.js";

type Document = { paths: JsonObject; components: { schemas: JsonObject } };
type DataOperation = { get: { responses: { 200: { content: { "application/json": { schema: { properties: { data: Json } } } } } } } };

const PREFIX = "/api/v2";
const DATA_BY_PATH = {
  "/flags": observationFlagSchema,
  "/cells": observedCellRecordSchema,
  "/placements": observedSitePlacementSchema,
  "/sites": observedSiteSchema,
};
const RENDER_TIMEOUT_MS = 60_000;

function renderDocument(): Document {
  const options = buildSwaggerOptions(PREFIX);
  const transform = options.transform as SwaggerTransform;
  const transformObject = options.transformObject as SwaggerTransformObject;
  const openapiObject = options.openapi ?? {};
  const paths = Object.fromEntries(
    Object.entries(DATA_BY_PATH).map(([path, data]) => {
      const url = `${PREFIX}${path}`;
      const routeSchema = { summary: "Probe", response: { 200: z.object({ data }) } };
      const route = { method: "GET", url, schema: routeSchema, handler: () => undefined } as unknown as RouteOptions;
      const { schema } = transform({ schema: routeSchema, url, route, openapiObject } as unknown as Parameters<SwaggerTransform>[0]);
      const responseSchema = (schema.response as Record<string, Json>)[200];
      return [url, { get: { responses: { 200: { description: "OK", content: { "application/json": { schema: responseSchema } } } } } }];
    }),
  );
  return transformObject({ openapiObject: { ...openapiObject, paths } } as unknown as Parameters<SwaggerTransformObject>[0]) as unknown as Document;
}

function resolve(node: Json | undefined, document: Document): JsonObject {
  if (!isJsonObject(node)) throw new Error("Not a schema");
  if (typeof node.$ref !== "string") return node;
  return resolve(document.components.schemas[node.$ref.split("/").at(-1) ?? ""], document);
}

let document: Document;

beforeAll(() => {
  document = renderDocument();
}, RENDER_TIMEOUT_MS);

describe("discriminator hints in the API document", () => {
  it.each([
    ["/flags", "kind"],
    ["/cells", "rat"],
    ["/placements", "kind"],
    ["/sites", "node"],
  ])("names the property that picks the branch of %s", (path, propertyName) => {
    const operation = document.paths[`${PREFIX}${path}`] as unknown as DataOperation;
    const union = resolve(operation.get.responses[200].content["application/json"].schema.properties.data, document);
    const branches = Array.isArray(union.oneOf) ? union.oneOf.map((branch) => resolve(branch, document)) : [];
    const values = branches.map((branch) => resolve(resolve(branch.properties, document)[propertyName], document).const);

    expect(union.discriminator).toMatchObject({ propertyName });
    expect(values.length).toBeGreaterThan(1);
    expect(values.every((value) => typeof value === "string")).toBe(true);
    expect(new Set(values).size).toBe(values.length);
  });

  it("maps the values of named branches to their models", () => {
    const models = {
      Mast: { type: "object", required: ["kind", "height"], properties: { kind: { const: "mast" }, height: { type: "number" } } },
      Roof: { type: "object", required: ["kind", "floors"], properties: { kind: { enum: ["roof"] }, floors: { type: "number" } } },
    };
    const schemas = withDiscriminators(
      { Structure: { oneOf: [{ $ref: "#/components/schemas/Mast" }, { $ref: "#/components/schemas/Roof" }] } },
      models,
    );

    expect(schemas.Structure).toMatchObject({
      discriminator: { propertyName: "kind", mapping: { mast: "#/components/schemas/Mast", roof: "#/components/schemas/Roof" } },
    });
  });

  it.each([
    ["a branch without a fixed value", { kind: { type: "string" } }],
    ["two branches with the same value", { kind: { const: "mast" } }],
  ])("gives no hint for a union with %s", (_case, secondKind) => {
    const union = {
      oneOf: [
        { type: "object", required: ["kind"], properties: { kind: { const: "mast" } } },
        { type: "object", required: ["kind"], properties: secondKind },
      ],
    };

    expect(withDiscriminators({ union }, {}).union).not.toHaveProperty("discriminator");
  });
});

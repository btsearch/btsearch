import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";
import * as contract from "@openbts/shared/contract";
import type { RouteOptions } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { z } from "zod/v4";

import { toDocumentedSchema } from "../../lib/documentedSchema.js";
import { type Json, type JsonObject, isJsonObject } from "./json.js";

export type OpenApiDocument = NonNullable<FastifyDynamicSwaggerOptions["openapi"]>;

type Direction = "input" | "output";
type SchemaText = string;
type ModelNames = Map<SchemaText, string>;
type Models = Map<string, JsonObject>;
type FoundModel = { name: string; schema: JsonObject; description?: string };

const SCHEMA_EXPORT_SUFFIX = "Schema";
const PARAMETER_SCHEMA_SUFFIXES = ["Params", "Query"];
const SMALLEST_MODEL_PROPERTY_COUNT = 2;
const MODEL_REFERENCE_PREFIX = "#/components/schemas/";
const MODEL_NAME_LOCALE = "en";
const PLACEHOLDER_ROUTE: RouteOptions = { method: "GET", url: "/", handler: () => undefined };

function modelNameOf(exportName: string): string {
  return exportName.charAt(0).toUpperCase() + exportName.slice(1, -SCHEMA_EXPORT_SUFFIX.length);
}

function contractModels(): [name: string, contractSchema: z.ZodType][] {
  return Object.entries(contract)
    .flatMap(([exportName, exported]): [string, z.ZodType][] => {
      if (!(exported instanceof z.ZodType) || !exportName.endsWith(SCHEMA_EXPORT_SUFFIX)) return [];
      return [[modelNameOf(exportName), exported]];
    })
    .filter(([name]) => !PARAMETER_SCHEMA_SUFFIXES.some((suffix) => name.endsWith(suffix)))
    .sort(([a], [b]) => a.length - b.length || a.localeCompare(b, MODEL_NAME_LOCALE));
}

function isModel(schema: unknown): schema is JsonObject {
  return isJsonObject(schema) && isJsonObject(schema.properties) && Object.keys(schema.properties).length >= SMALLEST_MODEL_PROPERTY_COUNT;
}

function schemaText(schema: JsonObject): SchemaText {
  return JSON.stringify(schema);
}

function contractSchemaText(contractSchema: z.ZodType, direction: Direction, openapiObject: OpenApiDocument): SchemaText | undefined {
  const routeSchema = direction === "input" ? { body: contractSchema } : { response: { 200: contractSchema } };
  const { schema } = jsonSchemaTransform({ schema: routeSchema, url: PLACEHOLDER_ROUTE.url, route: PLACEHOLDER_ROUTE, openapiObject });
  const converted: unknown = toDocumentedSchema(schema);
  if (!isJsonObject(converted)) return undefined;

  const jsonSchema = isJsonObject(converted.response) ? converted.response[200] : converted.body;
  return isModel(jsonSchema) ? schemaText(jsonSchema) : undefined;
}

function collectSchemaTexts(node: Json, schemaTexts: Set<SchemaText>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectSchemaTexts(item, schemaTexts);
    return;
  }
  if (!isJsonObject(node)) return;

  if (isModel(node)) {
    const { description, ...undescribed } = node;
    schemaTexts.add(schemaText(node));
    if (description !== undefined) schemaTexts.add(schemaText(undescribed));
  }
  for (const value of Object.values(node)) collectSchemaTexts(value, schemaTexts);
}

function nameUsedContractModels(usedSchemaTexts: ReadonlySet<SchemaText>, openapiObject: OpenApiDocument): ModelNames {
  const names: ModelNames = new Map();
  const takenNames = new Set<string>();
  const assign = (text: SchemaText, name: string) => {
    if (names.has(text) || takenNames.has(name)) return;
    names.set(text, name);
    takenNames.add(name);
  };

  for (const [name, contractSchema] of contractModels()) {
    const outputText = contractSchemaText(contractSchema, "output", openapiObject);
    const inputText = contractSchemaText(contractSchema, "input", openapiObject);
    const isOutputUsed = outputText !== undefined && usedSchemaTexts.has(outputText);
    const isInputUsed = inputText !== undefined && inputText !== outputText && usedSchemaTexts.has(inputText);

    if (isOutputUsed) assign(outputText, name);
    if (isInputUsed) assign(inputText, isOutputUsed ? `${name}Input` : name);
  }
  return names;
}

function findModel(schema: JsonObject, names: ModelNames): FoundModel | undefined {
  if (!isModel(schema)) return undefined;

  const name = names.get(schemaText(schema));
  if (name !== undefined) return { name, schema };
  if (typeof schema.description !== "string") return undefined;

  const { description, ...undescribed } = schema;
  const undescribedName = names.get(schemaText(undescribed));
  return undescribedName === undefined ? undefined : { name: undescribedName, schema: undescribed, description };
}

function referenceModelsInside(schema: JsonObject, names: ModelNames, referencedModels: Models): JsonObject {
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, referenceModels(value, names, referencedModels)]));
}

function referenceModels(node: Json, names: ModelNames, referencedModels: Models): Json {
  if (Array.isArray(node)) return node.map((item) => referenceModels(item, names, referencedModels));
  if (!isJsonObject(node)) return node;

  const model = findModel(node, names);
  if (!model) return referenceModelsInside(node, names, referencedModels);

  if (!referencedModels.has(model.name)) referencedModels.set(model.name, referenceModelsInside(model.schema, names, referencedModels));
  const $ref = `${MODEL_REFERENCE_PREFIX}${model.name}`;
  return model.description === undefined ? { $ref } : { $ref, description: model.description };
}

export function nameModels(paths: JsonObject, openapiObject: OpenApiDocument): { paths: JsonObject; models: JsonObject } {
  const usedSchemaTexts = new Set<SchemaText>();
  collectSchemaTexts(paths, usedSchemaTexts);
  const names = nameUsedContractModels(usedSchemaTexts, openapiObject);

  const referencedModels: Models = new Map();
  const pathsWithReferences = referenceModelsInside(paths, names, referencedModels);
  const sortedModels = Object.fromEntries([...referencedModels].sort(([a], [b]) => a.localeCompare(b, MODEL_NAME_LOCALE)));
  return { paths: pathsWithReferences, models: sortedModels };
}

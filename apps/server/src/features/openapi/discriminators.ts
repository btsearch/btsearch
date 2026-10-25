import { type Json, type JsonObject, isJsonObject } from "./json.js";

type Branch = { schema: JsonObject; reference?: string };

const MODEL_REFERENCE_PREFIX = "#/components/schemas/";
const SMALLEST_UNION = 2;

function resolveBranch(branch: Json, models: JsonObject): Branch | undefined {
  if (!isJsonObject(branch)) return undefined;

  const reference = branch.$ref;
  if (typeof reference !== "string") return { schema: branch };
  const model = reference.startsWith(MODEL_REFERENCE_PREFIX) ? models[reference.slice(MODEL_REFERENCE_PREFIX.length)] : undefined;
  return isJsonObject(model) ? { schema: model, reference } : undefined;
}

function singleValue(property: Json | undefined): string | undefined {
  if (!isJsonObject(property)) return undefined;
  if (typeof property.const === "string") return property.const;

  const values = property.enum;
  return Array.isArray(values) && values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

function requiredValue({ properties, required }: JsonObject, propertyName: string): string | undefined {
  if (!isJsonObject(properties) || !Array.isArray(required) || !required.includes(propertyName)) return undefined;
  return singleValue(properties[propertyName]);
}

function discriminatorOf(oneOf: Json[], models: JsonObject): JsonObject | undefined {
  const branches = oneOf.flatMap((option) => resolveBranch(option, models) ?? []);
  const first = branches[0];
  if (first === undefined || branches.length !== oneOf.length || branches.length < SMALLEST_UNION) return undefined;

  const candidates = isJsonObject(first.schema.properties) ? Object.keys(first.schema.properties) : [];
  for (const propertyName of candidates) {
    const values = branches.map(({ schema }) => requiredValue(schema, propertyName));
    if (!values.every((value): value is string => value !== undefined) || new Set(values).size !== values.length) continue;

    const mapping = Object.fromEntries(branches.flatMap(({ reference }, index) => (reference === undefined ? [] : [[values[index], reference]])));
    return Object.keys(mapping).length === 0 ? { propertyName } : { propertyName, mapping };
  }
  return undefined;
}

function withDiscriminator(node: Json, models: JsonObject): Json {
  if (Array.isArray(node)) return node.map((item) => withDiscriminator(item, models));
  if (!isJsonObject(node)) return node;

  const walked = withDiscriminators(node, models);
  const discriminator = Array.isArray(walked.oneOf) && walked.discriminator === undefined ? discriminatorOf(walked.oneOf, models) : undefined;
  return discriminator === undefined ? walked : { ...walked, discriminator };
}

export function withDiscriminators(node: JsonObject, models: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, withDiscriminator(value, models)]));
}

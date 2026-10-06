import { z } from "zod/v4";

import type { RegionRow } from "../../features/regions/serialize.js";

export type BoundaryOptions = {
  property?: string;
  prefix?: string;
  country?: string;
  srid?: number;
  mapping?: Record<string, string>;
};

const positionSchema = z.array(z.number()).min(2);
const ringSchema = z
  .array(positionSchema)
  .min(4)
  .refine((ring) => {
    const first = ring[0];
    const last = ring.at(-1);
    return first !== undefined && last !== undefined && first.length === last.length && first.every((value, index) => value === last[index]);
  }, "Polygon rings must be closed");
const polygonSchema = z.array(ringSchema).min(1);
const metadata = { crs: z.unknown().optional(), spatialReference: z.unknown().optional() };
const geometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygonSchema, ...metadata }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygonSchema).min(1), ...metadata }),
]);
const featureSchema = z.object({
  type: z.literal("Feature").optional(),
  properties: z.record(z.string(), z.unknown()).nullish(),
  geometry: geometrySchema,
  ...metadata,
});
const documentSchema = z.union([
  z.object({ type: z.literal("FeatureCollection").optional(), features: z.array(featureSchema), ...metadata }),
  featureSchema,
  z.array(featureSchema),
]);

type Feature = z.infer<typeof featureSchema>;
type Identity = "iso" | "code" | "name";
type Index = Map<string, RegionRow[]>;
type Evidence = { matches: RegionRow[]; reason: string; mapped: boolean; conflicting?: boolean };

function normalizeName(value: string): string {
  return value
    .replace(/\s*\((?:England|Scotland|Wales|Northern Ireland)\)\s*/gi, " ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSrid(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Boundary SRID must be a positive integer");
  return value === 102100 || value === 102113 ? 3857 : value;
}

function readCrs(value: unknown): number {
  const record = isRecord(value) ? value : undefined;
  const properties = isRecord(record?.properties) ? record.properties : undefined;
  const name = typeof value === "string" ? value : (properties?.name ?? record?.name);
  if (typeof name !== "string") throw new Error("Unrecognized boundary CRS; specify its EPSG code with --srid");
  if (/^(?:urn:ogc:def:crs:OGC(?::[^:]*)?:CRS84|https?:\/\/www\.opengis\.net\/def\/crs\/OGC\/[^/]+\/CRS84|(?:OGC:)?CRS84)$/i.test(name)) return 4326;
  const match = name.match(
    /^(?:EPSG:|urn:(?:x-)?ogc:def:crs:EPSG:(?:[^:]*):|https?:\/\/www\.opengis\.net\/def\/crs\/EPSG\/[^/]+\/|https?:\/\/www\.opengis\.net\/gml\/srs\/epsg\.xml#)(\d+)$/i,
  );
  if (!match) throw new Error(`Unrecognized boundary CRS "${name}"; specify its EPSG code with --srid`);
  return normalizeSrid(Number(match[1]));
}

function getSrid(records: { crs?: unknown; spatialReference?: unknown }[], override: number | undefined): number {
  if (override !== undefined) return normalizeSrid(override);
  const found = new Set<number>();
  for (const record of records) {
    if (record.crs !== undefined && record.crs !== null) found.add(readCrs(record.crs));
    if (record.spatialReference === undefined || record.spatialReference === null) continue;
    if (!isRecord(record.spatialReference)) throw new Error("Unrecognized boundary spatialReference; specify its EPSG code with --srid");
    const wkid = record.spatialReference.latestWkid ?? record.spatialReference.wkid;
    if (typeof wkid !== "number") throw new Error("Unrecognized boundary spatialReference; specify its EPSG code with --srid");
    found.add(normalizeSrid(wkid));
  }
  if (found.size > 1) throw new Error("Boundary features declare conflicting coordinate systems; use a file with one CRS or specify --srid");
  return found.values().next().value ?? 4326;
}

function checkCoordinates(features: Feature[], srid: number): void {
  if (srid !== 4326) return;
  for (const feature of features) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons)
      for (const ring of polygon)
        for (const position of ring) {
          const [longitude, latitude] = position;
          if (longitude === undefined || latitude === undefined || Math.abs(longitude) > 180 || Math.abs(latitude) > 90)
            throw new Error("Coordinates outside longitude/latitude bounds; specify the projected file's EPSG code with --srid");
        }
  }
}

function fieldIdentity(key: string): Identity | undefined {
  if (/^(?:objectid|fid|id|gid|globalid|name0|adm0name)$/.test(key)) return undefined;
  if (/^(?:name\d*|nameen|nameenglish|shapename|regionname|provincename|statename|adm\d+name|nazwa|jptnazwa|itl\d+nm|nutsname)$/.test(key))
    return "name";
  if (
    /^(?:code|regioncode|provincecode|statecode|shapeiso|adm\d+code|iso(?:code|3166|31662|2)?|iso31662code|hasc(?:\d+)?|nuts(?:id|code)|itl\d+cd|terc|jptkodje)$/.test(
      key,
    )
  )
    return "code";
  return undefined;
}

function addIndex(index: Index, key: string, region: RegionRow): void {
  const matches = index.get(key);
  if (matches) matches.push(region);
  else index.set(key, [region]);
}

function uniqueRegions(regions: RegionRow[]): RegionRow[] {
  return [...new Map(regions.map((region) => [region.id, region])).values()];
}

export function readRegionBoundaries(
  input: unknown,
  regions: RegionRow[],
  options: BoundaryOptions = {},
): { shapes: Map<number, unknown[]>; srid: number; messages: string[] } {
  const document = documentSchema.parse(input);
  let features: Feature[];
  if (Array.isArray(document)) features = document;
  else if ("features" in document) features = document.features;
  else features = [document];
  const records: { crs?: unknown; spatialReference?: unknown }[] = features.flatMap((feature) => [feature, feature.geometry]);
  if (!Array.isArray(document)) records.push(document);
  const srid = getSrid(records, options.srid);
  checkCoordinates(features, srid);

  const country = options.country?.trim().toUpperCase();
  if (country !== undefined && !/^[A-Z]{2}$/.test(country)) throw new Error("Boundary country must be a two-letter country code");
  const prefix = options.prefix ?? "";
  const indexes: Record<Identity, Index> = { iso: new Map(), code: new Map(), name: new Map() };
  for (const region of regions) {
    if (region.isoCode !== null) addIndex(indexes.iso, region.isoCode.trim().toUpperCase(), region);
    addIndex(indexes.code, region.code.trim().toUpperCase(), region);
    addIndex(indexes.name, normalizeName(region.name), region);
  }

  function resolve(value: string, identities: Identity[], scopeCountry?: string): { matches: RegionRow[]; identity?: Identity } {
    for (const identity of identities) {
      const keys = identity === "name" ? [normalizeName(value)] : [value.toUpperCase(), `${prefix}${value}`.toUpperCase()];
      const matches = uniqueRegions(
        keys
          .flatMap((key) => indexes[identity].get(key) ?? [])
          .filter((region) => scopeCountry === undefined || region.countryCode.toUpperCase() === scopeCountry),
      );
      if (matches.length > 0) return { matches, identity };
    }
    return { matches: [] };
  }

  function mappingKey(value: string): string | undefined {
    const mapping = options.mapping;
    if (mapping === undefined) return undefined;
    if (Object.hasOwn(mapping, value)) return value;
    const prefixedValue = `${prefix}${value}`;
    return Object.hasOwn(mapping, prefixedValue) ? prefixedValue : undefined;
  }

  function evidence(property: string, value: string, identity: Identity | undefined, scopeCountry?: string): Evidence {
    const mapping = options.mapping;
    const key = mappingKey(value);
    if (key !== undefined && mapping !== undefined) {
      const target = mapping[key];
      const resolved = typeof target === "string" ? resolve(target.trim(), ["iso", "code", "name"], scopeCountry) : { matches: [] };
      return { matches: resolved.matches, reason: `${property}=${JSON.stringify(value)} mapped to ${JSON.stringify(target)}`, mapped: true };
    }
    let identities: Identity[] = ["iso", "code"];
    if (options.property !== undefined) identities = ["iso", "code", "name"];
    else if (identity === "name") identities = ["name"];
    const resolved = resolve(value.trim(), identities, scopeCountry);
    if (identity === "name" && scopeCountry !== undefined && resolved.matches.length === 0 && resolve(value.trim(), ["name"]).matches.length > 0)
      return {
        matches: [],
        reason: `${property}=${JSON.stringify(value)} matches a name outside source country ${scopeCountry}`,
        mapped: false,
        conflicting: true,
      };
    return { matches: resolved.matches, reason: `${property}=${JSON.stringify(value)} (${resolved.identity ?? identity ?? "ISO"})`, mapped: false };
  }

  const shapes = new Map<number, unknown[]>();
  const messages: string[] = [`Boundary CRS: EPSG:${srid}`];
  for (const [ordinal, feature] of features.entries()) {
    const label = `feature ${ordinal + 1}`;
    const properties = Object.entries(feature.properties ?? {});
    const sourceCountries = new Set<string>();
    for (const [property, raw] of properties) {
      if (typeof raw !== "string" && typeof raw !== "number") continue;
      const value = String(raw).trim().toUpperCase();
      const key = property.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (/^(?:country|countrycode|isoa2|iso31661(?:alpha2)?)$/.test(key) && /^[A-Z]{2}$/.test(value))
        sourceCountries.add(value === "UK" ? "GB" : value);
      if (fieldIdentity(key) !== "code" && options.property !== property) continue;
      for (const code of [value, `${prefix}${value}`.toUpperCase()]) {
        const match = code.match(/^([A-Z]{2})-[A-Z0-9]{1,3}$/);
        if (match?.[1]) sourceCountries.add(match[1] === "UK" ? "GB" : match[1]);
      }
    }
    const sourceCountry = sourceCountries.values().next().value;
    if (sourceCountries.size > 1 || (sourceCountry !== undefined && country !== undefined && sourceCountry !== country)) {
      messages.push(
        `${label}: conflicting source country hints ${[...sourceCountries].join(", ")}${country === undefined ? "" : ` with --country ${country}`}, skipped`,
      );
      continue;
    }
    const scopeCountry = sourceCountry ?? country;
    const found: Evidence[] = [];
    for (const [property, raw] of properties) {
      if (options.property !== undefined && property !== options.property) continue;
      if (typeof raw !== "string" && typeof raw !== "number") continue;
      const value = String(raw);
      const key = property.replace(/[^a-z0-9]/gi, "").toLowerCase();
      const identity = fieldIdentity(key);
      const ignored = /^(?:objectid|fid|id|gid|globalid)$/.test(key);
      if (
        options.property === undefined &&
        mappingKey(value) === undefined &&
        (ignored || (identity === undefined && !indexes.iso.has(value.toUpperCase()) && !indexes.iso.has(`${prefix}${value}`.toUpperCase())))
      )
        continue;
      found.push(evidence(property, value, identity, scopeCountry));
    }
    const mapped = found.filter((item) => item.mapped);
    const relevant = mapped.length > 0 ? mapped : found;
    const invalidMapping = relevant.find((item) => item.mapped && item.matches.length !== 1);
    const ambiguous = relevant.find((item) => item.matches.length > 1 || item.conflicting);
    const matches = uniqueRegions(relevant.flatMap((item) => item.matches));
    if (invalidMapping) {
      messages.push(`${label}: mapping ${invalidMapping.reason} does not uniquely identify an existing region, skipped`);
      continue;
    }
    if (ambiguous || matches.length > 1) {
      messages.push(
        `${label}: ambiguous or conflicting matches (${relevant
          .filter((item) => item.matches.length > 0 || item.conflicting)
          .map((item) => item.reason)
          .join(", ")}), skipped`,
      );
      continue;
    }
    const region = matches[0];
    if (region === undefined) {
      messages.push(
        `${label}: no matching region (${found.map((item) => item.reason).join(", ") || `missing ${options.property ?? "recognized code/name properties"}`}), skipped`,
      );
      continue;
    }
    const geometries = shapes.get(region.id);
    if (geometries) geometries.push(feature.geometry);
    else shapes.set(region.id, [feature.geometry]);
    messages.push(
      `${label}: ${relevant
        .filter((item) => item.matches.length === 1)
        .map((item) => item.reason)
        .join(", ")} -> ${region.isoCode ?? `${region.countryCode}/${region.code}`} ${region.name}`,
    );
  }
  return { shapes, srid, messages };
}

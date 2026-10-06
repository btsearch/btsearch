import { regionBoundaries, regionLookup, regions } from "@openbts/drizzle";
import { sql as connection, db } from "@openbts/drizzle/db";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { z } from "zod/v4";

import type { RegionRow } from "../features/regions/serialize.js";
import type { DbTx } from "../types/global.js";
import { readRegionBoundaries } from "./importRegionBoundaries/boundaries.js";
import { readBoundaryInput } from "./importRegionBoundaries/input.js";

type StoredOutline = { isValid: boolean; reason: string; points: number; areaKm2: number };
type Overlap = { first: string; second: string; areaM2: number };
type Gap = { countryCode: string; gaps: number; areaM2: number; largestM2: number };
type Disagreement = { filed: string; found: string | null; state: "outside" | "moves" | "kept"; locations: number; sampleIds: number[] };

class DryRun extends Error {}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}

const FILE = option("file");
const REMOTE_URL = option("url");
const PROPERTY = option("property");
const PREFIX = option("prefix") ?? "";
const COUNTRY = option("country")?.trim().toUpperCase();
const APPLY = process.argv.includes("--apply");

async function storeOutline(tx: DbTx, region: RegionRow, geometries: unknown[], source: string, srid: number): Promise<void> {
  const shape = JSON.stringify({ type: "GeometryCollection", geometries });
  const [stored] = await tx.execute<StoredOutline>(sql`
    WITH raw AS (
      SELECT ST_CollectionExtract(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${shape}::text), ${srid}::integer), 4326), 3) AS geom
    ), stored AS (
      INSERT INTO ${regionBoundaries} (region_id, geom, source)
      SELECT ${region.id}::integer, ST_Multi(ST_CollectionExtract(ST_MakeValid(raw.geom, 'method=structure'), 3)), ${source}::text FROM raw
      ON CONFLICT (region_id) DO UPDATE SET geom = EXCLUDED.geom, source = EXCLUDED.source, updated_at = now()
      RETURNING geom
    )
    SELECT ST_IsValid(raw.geom) AS "isValid", ST_IsValidReason(raw.geom) AS reason, ST_NPoints(stored.geom) AS points,
      ST_Area(stored.geom::geography) / 1000000 AS "areaKm2"
    FROM raw, stored
  `);
  if (!stored || stored.points === 0) throw new Error(`${region.countryCode}/${region.code}: the file has no polygon for this region`);

  await tx.delete(regionLookup).where(eq(regionLookup.regionId, region.id));
  await tx.execute(sql`
    INSERT INTO ${regionLookup} (region_id, geom)
    SELECT ${region.id}::integer, part.geom
    FROM ${regionBoundaries} AS outline
    CROSS JOIN LATERAL ST_Subdivide(outline.geom, 256) AS piece (geom)
    CROSS JOIN LATERAL ST_Dump(piece.geom) AS part
    WHERE outline.region_id = ${region.id} AND ST_GeometryType(part.geom) = 'ST_Polygon'
  `);

  const repair = stored.isValid ? "" : `, repaired (${stored.reason})`;
  console.log(
    `${region.isoCode ?? `${region.countryCode}/${region.code}`} ${region.name}: ${stored.points} points, ${stored.areaKm2.toFixed(0)} km2${repair}`,
  );
}

async function reportMissingOutlines(tx: DbTx, countryCodes: string[]): Promise<void> {
  const rows = await tx
    .select({ name: regions.name, countryCode: regions.countryCode })
    .from(regions)
    .where(
      and(
        inArray(regions.countryCode, countryCodes),
        notInArray(regions.id, tx.select({ regionId: regionBoundaries.regionId }).from(regionBoundaries)),
      ),
    )
    .orderBy(regions.countryCode, regions.name);

  for (const row of rows) console.log(`no outline: ${row.countryCode} ${row.name}`);
}

async function reportOverlaps(tx: DbTx): Promise<void> {
  const overlaps = await tx.execute<Overlap>(sql`
    SELECT first_region.name AS first, second_region.name AS second, ST_Area(ST_Intersection(a.geom, b.geom)::geography) AS "areaM2"
    FROM ${regionBoundaries} AS a
    JOIN ${regionBoundaries} AS b ON a.region_id < b.region_id AND a.geom && b.geom AND ST_Relate(a.geom, b.geom, '2********')
    JOIN ${regions} AS first_region ON first_region.id = a.region_id
    JOIN ${regions} AS second_region ON second_region.id = b.region_id
    ORDER BY 3 DESC
  `);

  console.log(`\noutlines that overlap: ${overlaps.length} pairs`);
  for (const overlap of overlaps) console.log(`  ${overlap.first} and ${overlap.second}: ${overlap.areaM2.toFixed(0)} m2`);
}

async function reportGaps(tx: DbTx): Promise<void> {
  const gaps = await tx.execute<Gap>(sql`
    SELECT country.country_code AS "countryCode", count(*)::integer AS gaps, sum(ST_Area(hole.geom::geography)) AS "areaM2",
      max(ST_Area(hole.geom::geography)) AS "largestM2"
    FROM (
      SELECT ${regions.countryCode} AS country_code, ST_Union(outline.geom) AS geom
      FROM ${regionBoundaries} AS outline
      JOIN ${regions} ON ${regions.id} = outline.region_id
      GROUP BY ${regions.countryCode}
    ) AS country
    CROSS JOIN LATERAL ST_Dump(country.geom) AS shell
    CROSS JOIN LATERAL ST_DumpRings(shell.geom) AS hole
    WHERE hole.path[1] > 0
    GROUP BY country.country_code
  `);

  console.log(`\ncountries with holes between their outlines: ${gaps.length}`);
  for (const gap of gaps) {
    console.log(`  ${gap.countryCode}: ${gap.gaps} holes, ${gap.areaM2.toFixed(0)} m2 in total, the largest ${gap.largestM2.toFixed(0)} m2`);
  }
}

async function reportLocationDisagreements(tx: DbTx): Promise<void> {
  const rows = await tx.execute<Disagreement>(sql`
    SELECT filed.name AS filed, found.name AS found, checked.state, count(*)::integer AS locations,
      (array_agg(checked.id ORDER BY checked.id))[1:5] AS "sampleIds"
    FROM (
      SELECT measured.id, measured.region_id,
        CASE WHEN measured.kept IS NULL THEN 'outside' WHEN measured.kept <> measured.region_id THEN 'moves' ELSE 'kept' END AS state,
        CASE WHEN measured.kept <> measured.region_id THEN measured.kept ELSE measured.plain END AS found_id
      FROM (
        SELECT place.id, place.region_id, region_at(place.longitude, place.latitude, place.region_id) AS kept,
          region_at(place.longitude, place.latitude) AS plain,
          EXISTS (SELECT 1 FROM ${regionBoundaries} AS outline WHERE outline.region_id = place.region_id) AS has_outline
        FROM locations AS place
      ) AS measured
      WHERE (measured.kept IS NULL AND measured.has_outline)
        OR measured.kept <> measured.region_id
        OR (measured.kept = measured.region_id AND measured.plain <> measured.region_id)
    ) AS checked
    JOIN ${regions} AS filed ON filed.id = checked.region_id
    LEFT JOIN ${regions} AS found ON found.id = checked.found_id
    GROUP BY filed.name, found.name, checked.state
    ORDER BY 4 DESC
  `);

  console.log(`\nexisting locations the outlines disagree with: ${rows.reduce((total, row) => total + row.locations, 0)}`);
  for (const row of rows) {
    const sample = `${row.locations} locations, for example ids ${row.sampleIds.join(", ")}`;
    if (row.state === "outside") console.log(`  filed under ${row.filed}, more than 2 km from every outline: ${sample}`);
    else if (row.state === "moves") console.log(`  filed under ${row.filed}, would become ${row.found} when next saved: ${sample}`);
    else console.log(`  filed under ${row.filed}, the outlines say ${row.found}, within 2 km of ${row.filed} so left alone: ${sample}`);
  }
}

async function main(): Promise<void> {
  if (!FILE && !REMOTE_URL) {
    console.log(
      "usage: importRegionBoundaries (--file <geojson path or URL> | --url <HTTP(S) URL>) [--country <ISO country>] [--property <feature property>] [--prefix <text>] [--mapping <json>] [--srid <EPSG code>] [--source <text>] [--apply]",
    );
    console.log("region codes and names are detected automatically; --property selects a specific field, for example --property terc --prefix PL-");
    console.log("--mapping is a JSON object mapping source values to existing region ISO codes, short codes or names");
    process.exitCode = 1;
    return;
  }

  if (COUNTRY !== undefined && !/^[A-Z]{2}$/.test(COUNTRY)) throw new Error("--country must be a two-letter ISO country code");
  const sridOption = option("srid");
  const srid = sridOption === undefined ? undefined : Number(sridOption);
  if (srid !== undefined && (!Number.isInteger(srid) || srid <= 0)) throw new Error("--srid must be a positive EPSG integer");
  const mappingFile = option("mapping");
  const mappingInput: unknown = mappingFile === undefined ? undefined : JSON.parse(readFileSync(mappingFile, "utf8"));
  const mapping = mappingInput === undefined ? undefined : z.record(z.string(), z.string()).parse(mappingInput);
  if (
    mapping !== undefined &&
    typeof mappingInput === "object" &&
    mappingInput !== null &&
    Object.keys(mappingInput).some((key) => !Object.hasOwn(mapping, key))
  )
    throw new Error("--mapping contains a source key that cannot be preserved");
  const { data: input, source: inputSource } = await readBoundaryInput(FILE, REMOTE_URL);
  const source = option("source") ?? inputSource;
  const rows = await db.select().from(regions).orderBy(regions.countryCode, regions.code);
  const {
    shapes,
    srid: sourceSrid,
    messages,
  } = readRegionBoundaries(input, rows, { property: PROPERTY, prefix: PREFIX, country: COUNTRY, srid, mapping });
  for (const message of messages) console.log(message);
  console.log(`source coordinate system: EPSG:${sourceSrid}`);
  const matched = rows.filter((row) => shapes.has(row.id));
  if (matched.length === 0) throw new Error("No boundaries matched existing regions; check --country, --property or --mapping");

  try {
    await db.transaction(async (tx) => {
      for (const region of matched) {
        // eslint-disable-next-line no-await-in-loop
        await storeOutline(tx, region, shapes.get(region.id) ?? [], source, sourceSrid);
      }

      await reportMissingOutlines(tx, [...new Set(matched.map((row) => row.countryCode))]);
      await reportOverlaps(tx);
      await reportGaps(tx);
      await reportLocationDisagreements(tx);
      if (!APPLY) throw new DryRun();
    });
    console.log(`\nstored ${matched.length} outlines`);
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
    console.log(`\nnothing was written; run again with --apply to store these ${matched.length} outlines`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await connection.end();
    process.exit();
  });

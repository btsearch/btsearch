import { type BandVariant, bands, countryBands, type ratEnum, regions, ukeLocations, ukeOperators } from "@openbts/drizzle";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { BATCH_SIZE, COUNTRY_CODE } from "./config.js";
import { db } from "./database.js";
import { chunk, createLogger, stripCompanySuffixForName } from "./utils.js";

const logger = createLogger("upserts");

const UKE_OPERATOR_NAME_MAP: Record<string, string> = {
  p4: "Play",
  "orange polska": "Orange",
  "t-mobile polska": "T-Mobile",
  polkomtel: "Plus",
  "pkp polskie linie kolejowe": "PKP PLK",
  "tatrzańskie ochotnicze pogotowie ratunkowe": "TOPR",
};

export async function upsertRegions(items: { name: string; code: string }[]): Promise<Map<string, number>> {
  const unique = Array.from(new Map(items.filter((i) => i.name && i.code).map((i) => [i.name, i])).values());
  if (!unique.length) return new Map();

  const existing = await db.query.regions.findMany({ where: { name: { in: unique.map((r) => r.name) }, countryCode: COUNTRY_CODE } });
  const map = new Map<string, number>(existing.map((r) => [r.name, r.id]));

  const toInsert = unique.filter((r) => !map.has(r.name));
  if (toInsert.length) {
    const inserted = await db
      .insert(regions)
      .values(toInsert.map((r) => ({ name: r.name, code: r.code, countryCode: COUNTRY_CODE })))
      .returning({ id: regions.id, name: regions.name });
    for (const r of inserted) map.set(r.name, r.id);
  }

  return map;
}

export async function upsertBands(
  keys: { rat: (typeof ratEnum.enumValues)[number]; value: number; variant: (typeof BandVariant.enumValues)[number] }[],
): Promise<Map<string, number>> {
  const unique: { rat: (typeof ratEnum.enumValues)[number]; value: number; variant: (typeof BandVariant.enumValues)[number] }[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    if (k.rat === "NR" && k.value === 3600) k.value = 3500;
    const id = `${k.rat}:${k.value}:${k.variant}`;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(k);
  }

  if (!unique.length) return new Map();

  const matchesAnyKey = or(...unique.map((k) => and(eq(bands.rat, k.rat), eq(bands.value, k.value), eq(bands.variant, k.variant))));
  const existing = await db
    .select()
    .from(bands)
    .where(and(matchesAnyKey, isNull(bands.duplex)));

  const map = new Map<string, number>(existing.map((b) => [`${b.rat}:${b.value}:${b.variant}`, b.id]));
  const toInsert = unique.filter((k) => !map.has(`${k.rat}:${k.value}:${k.variant}`));

  if (toInsert.length) {
    const inserted = await db
      .insert(bands)
      .values(
        toInsert.map((b) => ({
          rat: b.rat,
          value: b.value,
          duplex: null,
          name: b.variant === "railway" ? `GSM-R ${b.value}` : `${b.rat} ${b.value}`,
          variant: b.variant,
        })),
      )
      .returning({ id: bands.id, rat: bands.rat, value: bands.value, variant: bands.variant });
    for (const r of inserted) map.set(`${r.rat}:${r.value}:${r.variant}`, r.id);
  }

  await addBandsToCountryPlan([...map.values()]);

  return map;
}

async function addBandsToCountryPlan(bandIds: number[]): Promise<void> {
  const planned = await db
    .select({ bandId: countryBands.bandId })
    .from(countryBands)
    .where(and(eq(countryBands.countryCode, COUNTRY_CODE), inArray(countryBands.bandId, bandIds)));
  const plannedIds = new Set(planned.map((row) => row.bandId));
  const missing = bandIds.filter((bandId) => !plannedIds.has(bandId));
  if (missing.length) await db.insert(countryBands).values(missing.map((bandId) => ({ countryCode: COUNTRY_CODE, bandId })));
}

export async function getOperators(rawNames: string[]): Promise<Map<string, number>> {
  const prepared = rawNames
    .map((full) => {
      const strippedName = stripCompanySuffixForName(full);
      const mappedName = UKE_OPERATOR_NAME_MAP[strippedName.toLowerCase()] ?? strippedName;
      return { originalName: strippedName, mappedName };
    })
    .filter((o) => o.mappedName.length > 0);

  const uniqueMappedNames = [...new Set(prepared.map((p) => p.mappedName))];

  const existingOperators = uniqueMappedNames.length
    ? await db.query.operators.findMany({ where: { name: { in: uniqueMappedNames }, countryCode: COUNTRY_CODE } })
    : [];

  const operatorIdByName = new Map(existingOperators.map((op) => [op.name, op.id]));

  const map = new Map<string, number>();
  for (const p of prepared) {
    const operatorId = operatorIdByName.get(p.mappedName);
    if (operatorId) map.set(p.originalName, operatorId);
  }
  return map;
}

export async function upsertUkeOperators(rawNames: string[]): Promise<Map<string, number>> {
  const prepared = rawNames
    .map((full) => {
      const name = stripCompanySuffixForName(full);
      return { name, full_name: full.trim() };
    })
    .filter((o) => o.name.length > 0);

  const uniqueByName = new Map<string, { name: string; full_name: string }>();
  for (const o of prepared) {
    if (!uniqueByName.has(o.name)) uniqueByName.set(o.name, o);
  }

  const values = Array.from(uniqueByName.values());
  if (!values.length) return new Map();

  const existing = await db.query.ukeOperators.findMany({ where: { full_name: { in: values.map((v) => v.full_name) } } });
  const map = new Map<string, number>(existing.map((o) => [o.name, o.id]));
  const existingFullNames = new Set(existing.map((o) => o.full_name));

  const toInsert = values.filter((v) => !existingFullNames.has(v.full_name));
  if (toInsert.length) {
    const brandedNamesakes = await db.query.ukeOperators.findMany({
      where: { name: { in: toInsert.map((op) => op.name) }, brandId: { isNotNull: true } },
      columns: { name: true, brandId: true },
    });
    const brandIdByName = new Map<string, number | null>();
    for (const namesake of brandedNamesakes) {
      const known = brandIdByName.get(namesake.name);
      brandIdByName.set(namesake.name, known === undefined || known === namesake.brandId ? namesake.brandId : null);
    }

    const inserted = await db
      .insert(ukeOperators)
      .values(toInsert.map((op) => ({ name: op.name, full_name: op.full_name, brandId: brandIdByName.get(op.name) ?? null })))
      .returning({ id: ukeOperators.id, name: ukeOperators.name });
    for (const r of inserted) map.set(r.name, r.id);
  }

  return map;
}

export async function upsertUkeLocations(
  items: { regionName: string; city: string | null; address: string | null; lon: number; lat: number }[],
  regionIds: Map<string, number>,
): Promise<Map<string, number>> {
  const uniq: typeof items = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = `${it.lon}:${it.lat}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }

  if (!uniq.length) return new Map();

  const map = new Map<string, number>();
  for (const group of chunk(uniq, BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await db
      .select({ id: ukeLocations.id, longitude: ukeLocations.longitude, latitude: ukeLocations.latitude })
      .from(ukeLocations)
      .where(
        sql`(${ukeLocations.longitude}, ${ukeLocations.latitude}) IN (${sql.join(
          group.map((l) => sql`(${l.lon}::double precision, ${l.lat}::double precision)`),
          sql`, `,
        )})`,
      );
    for (const r of rows) map.set(`${r.longitude}:${r.latitude}`, r.id);
  }

  const missing = uniq.filter((it) => !map.has(`${it.lon}:${it.lat}`));
  const toInsert = missing.flatMap((loc) => {
    const regionId = regionIds.get(loc.regionName);
    return regionId === undefined ? [] : [{ ...loc, regionId }];
  });
  if (toInsert.length < missing.length) logger.warn(`Skipped ${missing.length - toInsert.length} new locations with an unknown region`);
  if (toInsert.length) {
    for (const group of chunk(toInsert, BATCH_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      const inserted = await db
        .insert(ukeLocations)
        .values(
          group.map((loc) => ({
            region_id: loc.regionId,
            city: loc.city ?? undefined,
            address: loc.address ?? undefined,
            longitude: loc.lon,
            latitude: loc.lat,
          })),
        )
        .returning({ id: ukeLocations.id, longitude: ukeLocations.longitude, latitude: ukeLocations.latitude });
      for (const r of inserted) map.set(`${r.longitude}:${r.latitude}`, r.id);
    }
  }

  return map;
}

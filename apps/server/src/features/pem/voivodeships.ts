import { regions } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { and, eq, inArray } from "drizzle-orm";

export const VOIVODESHIP_TO_TERYT_PREFIX: Record<string, string> = {
  Dolnośląskie: "02",
  "Kujawsko-pomorskie": "04",
  Lubelskie: "06",
  Lubuskie: "08",
  Łódzkie: "10",
  Małopolskie: "12",
  Mazowieckie: "14",
  Opolskie: "16",
  Podkarpackie: "18",
  Podlaskie: "20",
  Pomorskie: "22",
  Śląskie: "24",
  Świętokrzyskie: "26",
  "Warmińsko-mazurskie": "28",
  Wielkopolskie: "30",
  Zachodniopomorskie: "32",
};
const TERYT_PREFIX_TO_VOIVODESHIP: Record<string, string> = Object.fromEntries(
  Object.entries(VOIVODESHIP_TO_TERYT_PREFIX).map(([name, prefix]) => [prefix, name]),
);

export function getVoivodeshipByTeryt(teryt: number | string | null | undefined): string | null {
  if (teryt === null || teryt === undefined || teryt === "") return null;
  return TERYT_PREFIX_TO_VOIVODESHIP[String(teryt).padStart(7, "0").slice(0, 2)] ?? null;
}

export async function fetchRegion(regionId: number) {
  const [region] = await db.select().from(regions).where(eq(regions.id, regionId)).limit(1);
  return region;
}

export async function fetchRegionsMap(names: (string | null)[]) {
  const uniqueNames = [...new Set(names.filter((name): name is string => Boolean(name)))];
  const rows = uniqueNames.length
    ? await db
        .select()
        .from(regions)
        .where(and(inArray(regions.name, uniqueNames), eq(regions.countryCode, "PL")))
    : [];
  return new Map(rows.map((region) => [region.name, region]));
}

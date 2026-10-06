import { countries } from "@openbts/drizzle";
import type { Country, CountryView } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const countrySelectSchema = createSelectSchema(countries);

type CountryRow = z.infer<typeof countrySelectSchema>;

export function toCountry(row: CountryRow): Country {
  const { viewWest: west, viewSouth: south, viewEast: east, viewNorth: north } = row;
  const defaultView = west !== null && south !== null && east !== null && north !== null ? { west, south, east, north } : null;

  return { code: row.code, isVisible: row.isVisible, contributions: row.contributions, defaultView };
}

export function viewColumns(view: CountryView | null | undefined) {
  if (view === undefined) return {};

  return {
    viewWest: view?.west ?? null,
    viewSouth: view?.south ?? null,
    viewEast: view?.east ?? null,
    viewNorth: view?.north ?? null,
  };
}

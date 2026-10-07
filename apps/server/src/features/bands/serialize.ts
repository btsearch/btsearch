import { bands, countryBands } from "@openbts/drizzle";
import { type KhzRange, findCatalogBand } from "@openbts/shared/bandCatalog";
import type { Band, BandRat, CountryBand } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const bandSelectSchema = createSelectSchema(bands);
const countryBandSelectSchema = createSelectSchema(countryBands);

export type BandRow = z.infer<typeof bandSelectSchema>;
export type CountryBandRow = z.infer<typeof countryBandSelectSchema>;

const RATS = { GSM: "gsm", UMTS: "umts", LTE: "lte", NR: "nr" } as const;
const DUPLEXES = { FDD: "fdd", TDD: "tdd", SDL: "sdl" } as const;

export const DATABASE_RATS: Record<BandRat, BandRow["rat"]> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };

function toRange(range: KhzRange | null | undefined): [number, number] | null {
  return range ? [range[0], range[1]] : null;
}

export function toBand(row: BandRow): Band {
  if (row.rat === "CDMA" || row.rat === "IOT") throw new Error(`Unsupported cell band technology: ${row.rat}`);

  const catalog = findCatalogBand(row.code);
  const duplex = catalog && catalog.duplex !== "SUL" ? catalog.duplex : row.duplex;

  return {
    id: row.id,
    rat: RATS[row.rat],
    code: row.code,
    number: catalog?.number ?? null,
    name: row.name,
    labelMhz: row.value,
    duplex: duplex ? DUPLEXES[duplex] : null,
    variant: row.variant,
    downlinkKhz: toRange(catalog?.downlinkKhz),
    uplinkKhz: toRange(catalog?.uplinkKhz),
  };
}

export function toCountryBand(row: CountryBandRow, band?: BandRow): CountryBand {
  const countryBand: CountryBand = { countryCode: row.countryCode, bandId: row.bandId };
  if (band) countryBand.band = toBand(band);
  return countryBand;
}

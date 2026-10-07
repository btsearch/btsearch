import { z } from "zod/v4";

import { CELL_RATS } from "./cells.ts";
import { countryCodeSchema, csvCountryCodesSchema, csvEnumSchema, daySchema } from "./common.ts";

export const STATISTICS_DIMENSIONS = ["region", "operator", "rat", "band"] as const;
export type StatisticsDimension = (typeof STATISTICS_DIMENSIONS)[number];

export const STATISTICS_INTERVALS = ["day", "month"] as const;
export type StatisticsInterval = (typeof STATISTICS_INTERVALS)[number];

const countSchema = z.number().int().nonnegative();

export const officialStatisticsSchema = z.object({
  locations: countSchema,
  permits: countSchema,
  microwaveLinks: countSchema,
  permitsImportedAt: z.iso.datetime().nullable().describe("When permits were last imported, or `null` if never"),
  microwaveLinksImportedAt: z.iso.datetime().nullable().describe("When microwave links were last imported, or `null` if never"),
});
export type OfficialStatistics = z.infer<typeof officialStatisticsSchema>;

export const countryStatisticsSchema = z.object({
  countryCode: countryCodeSchema,
  stations: z.object({
    active: countSchema,
    awaitingCells: countSchema,
    inactive: countSchema,
  }),
  cells: countSchema.describe("The number of cells on stations of any status"),
  locations: countSchema.describe("The number of locations, with or without stations"),
  updatedAt: z.iso.datetime().nullable().describe("When a station in the country was last updated, or `null` if it has no stations"),
  official: officialStatisticsSchema.nullable().describe("Totals from the official register, or `null` if the country has none"),
});
export type CountryStatistics = z.infer<typeof countryStatisticsSchema>;

export const statisticsQuerySchema = z.object({ countryCodes: csvCountryCodesSchema.optional() }).strict();
export type StatisticsQuery = z.infer<typeof statisticsQuerySchema>;

export const stationBreakdownRowSchema = z.object({
  countryCode: countryCodeSchema,
  regionId: z.number().int().nullable().describe("`null` if `groupBy` does not include `region`, or for stations without a location"),
  operatorId: z.number().int().nullable().describe("`null` if `groupBy` does not include `operator`, or for stations without an operator"),
  rat: z.enum(CELL_RATS).nullable().describe("`null` if `groupBy` does not include `rat`"),
  bandId: z.number().int().nullable().describe("`null` if `groupBy` does not include `band`, or for cells whose band is unknown"),
  stations: countSchema.describe(
    "The number of active stations in the group. With `rat` or `band` in `groupBy`, a station is counted in every group it has cells in",
  ),
  cells: countSchema.describe("The number of cells those stations have in the group"),
});
export type StationBreakdownRow = z.infer<typeof stationBreakdownRowSchema>;

export const stationBreakdownQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional(),
    groupBy: csvEnumSchema(STATISTICS_DIMENSIONS)
      .refine((dimensions) => new Set(dimensions).size === dimensions.length, { message: "Each dimension may be named once" })
      .optional()
      .describe(`Splits each country further by these dimensions. Comma-separated list. Possible values: \`${STATISTICS_DIMENSIONS.join("`, `")}\``),
  })
  .strict();
export type StationBreakdownQuery = z.infer<typeof stationBreakdownQuerySchema>;

const documentedCellsSchema = z.object({
  total: countSchema.describe("The number of cells on active stations"),
  withPci: countSchema.describe("The number of those cells that have a PCI"),
});

export const countryCompletenessSchema = z.object({
  countryCode: countryCodeSchema,
  stations: z.object({
    total: countSchema.describe("The number of active stations"),
    withSectors: countSchema.describe("The number of active stations with at least one sector"),
    withIdentifiers: countSchema.describe("The number of active stations with at least one identifier"),
  }),
  cells: z.object({
    lte: documentedCellsSchema,
    nr: documentedCellsSchema,
  }),
});
export type CountryCompleteness = z.infer<typeof countryCompletenessSchema>;

const changeSchema = z.number().int();

export const statisticsHistoryPointSchema = z.object({
  countryCode: countryCodeSchema,
  snapshotOn: daySchema.describe("The day the snapshot was taken"),
  stations: countSchema.describe("The number of stations of any status"),
  cells: countSchema.describe("The number of cells on those stations"),
  sectors: countSchema.describe("The number of sectors on those stations"),
  identifiers: countSchema.describe("The number of identifiers on those stations"),
  cellsWithPci: countSchema.describe("The number of LTE and NR cells that have a PCI"),
  added: z
    .object({
      stations: changeSchema,
      cells: changeSchema,
      sectors: changeSchema,
      identifiers: changeSchema,
      cellsWithPci: changeSchema,
    })
    .describe("The change since the previous point for the same country. Zero for a country's first point"),
});
export type StatisticsHistoryPoint = z.infer<typeof statisticsHistoryPointSchema>;

export const statisticsHistoryQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional(),
    takenAfter: daySchema.optional().describe("Returns only snapshots taken on or after this day"),
    takenBefore: daySchema.optional().describe("Returns only snapshots taken on or before this day"),
    interval: z.enum(STATISTICS_INTERVALS).default("month").describe("`month` returns the last snapshot of each month, `day` returns every snapshot"),
  })
  .strict();
export type StatisticsHistoryQuery = z.infer<typeof statisticsHistoryQuerySchema>;

export const analyzerUsagePointSchema = z.object({
  startsOn: daySchema.describe("The UTC day, or the first day of the month with `interval=month`"),
  count: countSchema.describe("How many times the log analyzer was used in that day or month"),
});
export type AnalyzerUsagePoint = z.infer<typeof analyzerUsagePointSchema>;

export const analyzerUsageQuerySchema = z
  .object({
    usedAfter: daySchema.optional().describe("Returns only usage on or after this UTC day"),
    usedBefore: daySchema.optional().describe("Returns only usage on or before this UTC day"),
    interval: z.enum(STATISTICS_INTERVALS).default("day").describe("`day` returns one point per day, `month` adds up the days of each month"),
  })
  .strict();
export type AnalyzerUsageQuery = z.infer<typeof analyzerUsageQuerySchema>;

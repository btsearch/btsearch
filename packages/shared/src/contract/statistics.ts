import { z } from "zod/v4";

import { BAND_VARIANTS } from "./bands.ts";
import { countryCodeSchema, csvCountryCodesSchema, csvEnumSchema, daySchema } from "./common.ts";
import { CELL_RATS } from "./constants.ts";
import { OFFICIAL_RATS } from "./officialSites.ts";

export const STATISTICS_DIMENSIONS = ["region", "operator", "rat", "band"] as const;
export type StatisticsDimension = (typeof STATISTICS_DIMENSIONS)[number];

export const STATISTICS_INTERVALS = ["day", "month"] as const;
export type StatisticsInterval = (typeof STATISTICS_INTERVALS)[number];

export const PERMIT_STATISTICS_DIMENSIONS = ["operator", "region", "rat", "label"] as const;
export type PermitStatisticsDimension = (typeof PERMIT_STATISTICS_DIMENSIONS)[number];

export const PERMIT_HISTORY_DIMENSIONS = ["operator", "label"] as const;
export type PermitHistoryDimension = (typeof PERMIT_HISTORY_DIMENSIONS)[number];

const countSchema = z.number().int().nonnegative();

function groupBySchema<const T extends readonly [string, ...string[]]>(dimensions: T) {
  return csvEnumSchema(dimensions)
    .refine((grouped) => new Set(grouped).size === grouped.length, { message: "Each dimension may be named once" })
    .optional()
    .describe(`Splits each country further by these dimensions. Comma-separated list. Possible values: \`${dimensions.join("`, `")}\``);
}

export const officialStatisticsSchema = z.object({
  locations: countSchema,
  permits: countSchema,
  microwaveLinks: countSchema,
  permitsImportedAt: z.iso.datetime().nullable(),
  microwaveLinksImportedAt: z.iso.datetime().nullable(),
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
  updatedAt: z.iso.datetime().nullable().describe("When a station in the country was last updated"),
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
    groupBy: groupBySchema(STATISTICS_DIMENSIONS),
  })
  .strict();
export type StationBreakdownQuery = z.infer<typeof stationBreakdownQuerySchema>;

const documentedCellsSchema = z.object({
  total: countSchema.describe("The number of cells on active stations"),
  withPci: countSchema,
});

export const countryCompletenessSchema = z.object({
  countryCode: countryCodeSchema,
  stations: z.object({
    total: countSchema.describe("The number of active stations"),
    withSectors: countSchema,
    withIdentifiers: countSchema,
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
  snapshotOn: daySchema,
  stations: countSchema.describe("Stations of any status"),
  cells: countSchema,
  sectors: countSchema,
  identifiers: countSchema,
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
  count: countSchema,
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

const LABEL_NOTE = "`null` if `groupBy` does not include `label`, or if the register names none";
const VARIANT_NOTE = `\`railway\` for a band set aside for railways, \`commercial\` for every other band. ${LABEL_NOTE}`;

export const permitBreakdownRowSchema = z.object({
  countryCode: countryCodeSchema.describe("The country the official sites are in"),
  operatorId: z.number().int().nullable().describe("`null` if `groupBy` does not include `operator`, or for sites without an operator"),
  regionId: z.number().int().nullable().describe("`null` if `groupBy` does not include `region`, or for sites in no known region"),
  rat: z.enum(OFFICIAL_RATS).nullable().describe("`null` if `groupBy` includes neither `rat` nor `label`, or if the register names no technology"),
  labelMhz: z.number().int().nullable().describe(`The nominal frequency of the band in MHz. ${LABEL_NOTE}`),
  variant: z.enum(BAND_VARIANTS).nullable().describe(VARIANT_NOTE),
  sites: countSchema.describe("The number of official sites with at least one permit in the group"),
  permits: countSchema,
});
export type PermitBreakdownRow = z.infer<typeof permitBreakdownRowSchema>;

export const permitBreakdownQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional(),
    groupBy: groupBySchema(PERMIT_STATISTICS_DIMENSIONS),
  })
  .strict();
export type PermitBreakdownQuery = z.infer<typeof permitBreakdownQuerySchema>;

export const permitHistoryPointSchema = z.object({
  countryCode: countryCodeSchema.describe("The country of the operators"),
  snapshotOn: daySchema,
  operatorId: z.number().int().nullable().describe("`null` if `groupBy` does not include `operator`"),
  rat: z.enum(OFFICIAL_RATS).nullable().describe(LABEL_NOTE),
  labelMhz: z.number().int().nullable().describe(`The nominal frequency of the band in MHz. ${LABEL_NOTE}`),
  variant: z.enum(BAND_VARIANTS).nullable().describe(VARIANT_NOTE),
  sites: countSchema.describe("The number of official sites with at least one permit in the group"),
  permits: countSchema,
  added: z
    .object({
      sites: changeSchema,
      permits: changeSchema,
    })
    .describe(
      "The change since the previous snapshot of the same country in the response. " +
        "A group that was not in that snapshot counts from zero, and every change is zero on a country's first snapshot",
    ),
});
export type PermitHistoryPoint = z.infer<typeof permitHistoryPointSchema>;

export const permitHistoryQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema.optional(),
    groupBy: groupBySchema(PERMIT_HISTORY_DIMENSIONS),
    takenAfter: daySchema.optional().describe("Returns only snapshots taken on or after this day"),
    takenBefore: daySchema.optional().describe("Returns only snapshots taken on or before this day"),
    interval: z.enum(STATISTICS_INTERVALS).default("month").describe("`month` returns the last snapshot of each month, `day` returns every snapshot"),
  })
  .strict();
export type PermitHistoryQuery = z.infer<typeof permitHistoryQuerySchema>;

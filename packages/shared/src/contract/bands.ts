import { z } from "zod/v4";

import {
  AT_LEAST_ONE_FIELD_ISSUE,
  MAX_ID,
  countryCodeSchema,
  csvCountryCodesSchema,
  csvEnumSchema,
  csvSchema,
  hasAnyField,
  idParamSchema,
} from "./common.ts";

export const BAND_RATS = ["gsm", "umts", "lte", "nr"] as const;
export type BandRat = (typeof BAND_RATS)[number];

export const UNKNOWN_BAND = "unknown";
export const UNKNOWN_BAND_NOTE = "`null` if the band is unknown";

const bandFilterEntrySchema = z.union([z.literal(UNKNOWN_BAND), z.coerce.number<string>().int().positive().max(MAX_ID)], {
  error: `Must be a band id or the word ${UNKNOWN_BAND}`,
});

export const csvBandIdsSchema = csvSchema
  .pipe(z.array(bandFilterEntrySchema).min(1).max(100))
  .describe(`Comma-separated band ids. Use \`${UNKNOWN_BAND}\` to match cells whose band is unknown`);
export type BandIdFilter = z.infer<typeof csvBandIdsSchema>;

export const BAND_DUPLEXES = ["fdd", "tdd", "sdl"] as const;
export const BAND_VARIANTS = ["commercial", "railway"] as const;
export const COUNTRY_BAND_INCLUDES = ["band"] as const;

const khzRangeSchema = z.tuple([z.number().int(), z.number().int()]);

const BAND_RAT_NOTE = "The technology the band belongs to: `gsm`, `umts`, `lte` or `nr`";
const BAND_CODE_NOTE =
  "A code from the 3GPP catalogue, such as `E-GSM900`, `VIII`, `B3` or `n78`. Uplink-only bands are not accepted. " +
  "The code sets the band's technology, duplex mode and frequency ranges, and an existing band can only change to a code of the same technology";
const LABEL_MHZ_NOTE = "The frequency the band is commonly known by, in MHz, for example `1800` for `B3`";
const BAND_VARIANT_NOTE = "`railway` for a band of a railway network, such as GSM-R, and `commercial` for every other band";
const UPLINK_KHZ_NOTE =
  "The uplink frequency range in kHz as `[low, high]`, from the 3GPP catalogue. Equal to `downlinkKhz` for a `tdd` band. " +
  "`null` for an `sdl` band and for a band without a `code`";

export const bandSchema = z.object({
  id: z.number().int(),
  rat: z.enum(BAND_RATS).describe(BAND_RAT_NOTE),
  code: z.string().nullable().describe("The band's code in the 3GPP catalogue, such as `E-GSM900`, `VIII`, `B3` or `n78`, or `null` if it has none"),
  number: z.number().int().nullable().describe("The 3GPP band number, for example `3` for `B3`. `null` for GSM bands and for bands without a `code`"),
  name: z.string(),
  labelMhz: z.number().int().nullable().describe(`${LABEL_MHZ_NOTE}. \`null\` if it is not set`),
  duplex: z
    .enum(BAND_DUPLEXES)
    .nullable()
    .describe("The duplex mode, taken from the 3GPP catalogue for a band with a `code`. `sdl` means downlink only. `null` if it is not set"),
  variant: z.enum(BAND_VARIANTS).describe(BAND_VARIANT_NOTE),
  downlinkKhz: khzRangeSchema
    .nullable()
    .describe("The downlink frequency range in kHz as `[low, high]`, from the 3GPP catalogue. `null` for a band without a `code`"),
  uplinkKhz: khzRangeSchema.nullable().describe(UPLINK_KHZ_NOTE),
});
export type Band = z.infer<typeof bandSchema>;

export const bandListQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema
      .optional()
      .describe("Returns only the bands in the band plan of these countries. Comma-separated two-letter country codes"),
    rats: csvEnumSchema(BAND_RATS)
      .optional()
      .describe(`Returns only the bands of these technologies. Comma-separated list. Possible values: \`${BAND_RATS.join("`, `")}\``),
  })
  .strict();
export type BandListQuery = z.infer<typeof bandListQuerySchema>;

export const bandCreateSchema = z
  .object({
    code: z.string().min(1).max(16).describe(BAND_CODE_NOTE),
    name: z.string().trim().min(1).max(15).describe("The band's display name. Must be unique across all bands"),
    variant: z
      .enum(BAND_VARIANTS)
      .optional()
      .describe(`${BAND_VARIANT_NOTE}. A new band defaults to \`commercial\`, and each catalogue band can exist once per variant`),
    labelMhz: z
      .number()
      .int()
      .positive()
      .max(100_000)
      .optional()
      .describe(`${LABEL_MHZ_NOTE}. If omitted when a band is created or its \`code\` changes, the catalogue's value is used`),
  })
  .strict();
export type BandCreate = z.infer<typeof bandCreateSchema>;

export const bandParamsSchema = z.object({ id: idParamSchema });

export const bandUpdateSchema = bandCreateSchema.partial().refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type BandUpdate = z.infer<typeof bandUpdateSchema>;

export const countryBandSchema = z.object({
  countryCode: countryCodeSchema,
  bandId: z.number().int(),
  band: bandSchema.optional().describe("Only returned with `include=band`"),
});
export type CountryBand = z.infer<typeof countryBandSchema>;

export const countryBandParamsSchema = z.object({
  code: countryCodeSchema,
  bandId: idParamSchema,
});

export const countryBandListQuerySchema = z
  .object({
    include: csvEnumSchema(COUNTRY_BAND_INCLUDES).optional(),
  })
  .strict();
export type CountryBandListQuery = z.infer<typeof countryBandListQuerySchema>;

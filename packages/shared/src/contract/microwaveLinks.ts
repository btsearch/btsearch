import { z } from "zod/v4";

import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_NOTE,
  INCLUDE_TOTAL_NOTE,
  LIMIT_NOTE,
  bboxSchema,
  booleanQuerySchema,
  csvEnumSchema,
  csvIdsSchema,
  csvSchema,
  cursorSchema,
  daySchema,
  idParamSchema,
  instantSchema,
  offsetSchema,
  pagingSchema,
  searchTextSchema,
  usesCursorOrOffset,
} from "./common.ts";
import { OFFICIAL_PERMIT_KINDS, officialPermitKindSchema } from "./officialSites.ts";
import { csvSourceKeysSchema, licenseeSchema } from "./officialSources.ts";

export const MICROWAVE_LINK_INCLUDES = ["licensee"] as const;
export type MicrowaveLinkInclude = (typeof MICROWAVE_LINK_INCLUDES)[number];

export const MICROWAVE_LINK_SORTS = ["-id", "id", "createdAt", "-createdAt", "updatedAt", "-updatedAt"] as const;
export type MicrowaveLinkSort = (typeof MICROWAVE_LINK_SORTS)[number];

export const MAX_MICROWAVE_LINK_LIST_LIMIT = 1000;

const PERMIT_NUMBER_MAX_LENGTH = 100;
const LIST_ID_MAX_LENGTH = 64;

const SORT_NOTE = "The field to sort by, with a leading `-` for descending order. A `cursor` only works with the `sort` it was returned for";
const AS_PUBLISHED_NOTE = "as the register writes it. `null` if it gives none";

export const microwaveLinkEquipmentSchema = z.object({
  id: z.number().int(),
  name: z.string().describe("The model, as the register writes it"),
  manufacturer: z
    .object({ id: z.number().int(), name: z.string() })
    .nullable()
    .describe("The manufacturer, as the register writes it. `null` if it names none"),
});
export type MicrowaveLinkEquipment = z.infer<typeof microwaveLinkEquipmentSchema>;

const microwaveLinkEndShape = {
  latitude: z.number(),
  longitude: z.number(),
  groundHeightMeters: z.number().nullable().describe("The height of the ground in meters above sea level. `null` if the register gives none"),
  city: z.string().nullable().describe(`The city or village, ${AS_PUBLISHED_NOTE}`),
  province: z.string().nullable().describe(`The province or region, ${AS_PUBLISHED_NOTE}`),
  street: z.string().nullable().describe(`The street, ${AS_PUBLISHED_NOTE}`),
  locationDescription: z.string().nullable().describe("The register's description of the place. `null` if it gives none"),
  antenna: microwaveLinkEquipmentSchema.nullable().describe("The antenna model. `null` if the register names none"),
  antennaGainDbi: z.number().nullable().describe("The antenna gain in dBi. `null` if the register gives none"),
  antennaHeightMeters: z.number().nullable().describe("The height of the antenna in meters above the ground. `null` if the register gives none"),
};

const microwaveLinkPermitSchema = z.object({
  number: z.string().nullable().describe(`The permit's number, ${AS_PUBLISHED_NOTE}`),
  kind: officialPermitKindSchema.nullable(),
  issuedOn: daySchema.nullable().describe("The day the permit was issued. `null` if the register does not say"),
  expiresOn: daySchema.nullable().describe("The last day the permit is valid. `null` if it does not expire, or if the register does not say"),
});

export const microwaveLinkSchema = z.object({
  id: z.number().int(),
  sourceKey: z.string().describe("The key of the source the link comes from, as in `GET /official/sources`"),
  licenseeId: z
    .number()
    .int()
    .nullable()
    .describe("The licensee that holds the link's permit, as in `GET /official/licensees`. `null` if the register names none"),
  permit: microwaveLinkPermitSchema.describe("The permit the link is operated under. Several links can share one permit"),
  frequencyMhz: z.number().describe("The frequency of the channel in MHz"),
  channelNumber: z.number().int().nullable().describe("The number of the channel in its frequency plan. `null` if the register gives none"),
  channelWidthMhz: z.number().nullable().describe("The width of the channel in MHz. `null` if the register gives none"),
  planSymbol: z.string().nullable().describe(`The symbol of the frequency plan, ${AS_PUBLISHED_NOTE}`),
  polarization: z.string().nullable().describe(`The polarization, ${AS_PUBLISHED_NOTE}`),
  modulation: z.string().nullable().describe(`The modulation, ${AS_PUBLISHED_NOTE}`),
  capacity: z
    .string()
    .nullable()
    .describe(
      "The capacity as the register publishes it. A plain number is in Mbps. " +
        "It is text because a register can also write values such as `2x1000`. `null` if it gives none",
    ),
  specsAsOf: z.iso
    .datetime()
    .nullable()
    .describe(
      "When the technical details were last read: the modulation, the capacity, the equipment, gains and losses. " +
        "Some releases leave them out, so this can be earlier than `updatedAt`. `null` if no release had them",
    ),
  tx: z
    .object({
      ...microwaveLinkEndShape,
      eirpDbm: z.number().nullable().describe("The effective isotropic radiated power in dBm. `null` if the register gives none"),
      transmitter: microwaveLinkEquipmentSchema.nullable().describe("The transmitter model. `null` if the register names none"),
    })
    .describe("The transmitting end"),
  rx: z
    .object({
      ...microwaveLinkEndShape,
      antennaAttenuationDb: z.number().nullable().describe("The loss between the antenna and the receiver in dB. `null` if the register gives none"),
      noiseFigureDb: z.number().nullable().describe("The receiver's noise figure in dB. `null` if the register gives none"),
      atpcAttenuationDb: z
        .number()
        .nullable()
        .describe("How far automatic transmit power control (ATPC) can turn the power down, in dB. `null` if the register gives none"),
    })
    .describe("The receiving end"),
  createdAt: z.iso.datetime().describe("When the link was first imported"),
  updatedAt: z.iso.datetime(),
  licensee: licenseeSchema.nullable().optional().describe(`${INCLUDE_NOTE}. \`null\` if the register names none`),
});
export type MicrowaveLink = z.infer<typeof microwaveLinkSchema>;

export const microwaveLinkParamsSchema = z.object({ id: idParamSchema });

export const microwaveLinkQuerySchema = z.object({ include: csvEnumSchema(MICROWAVE_LINK_INCLUDES).optional() }).strict();
export type MicrowaveLinkQuery = z.infer<typeof microwaveLinkQuerySchema>;

export const microwaveLinkListQuerySchema = z
  .object({
    q: searchTextSchema.optional().describe("Matches links whose permit number contains this text or closely resembles it. Letter case is ignored"),
    permitNumbers: csvSchema
      .pipe(z.array(z.string().min(1).max(PERMIT_NUMBER_MAX_LENGTH)).min(1).max(100))
      .optional()
      .describe("Matches links whose permit number is exactly one of these. Comma-separated"),
    licenseeIds: csvIdsSchema.optional().describe("Matches links held by these licensees. Comma-separated ids"),
    sourceKeys: csvSourceKeysSchema.optional().describe("Matches links of these sources. Comma-separated source keys"),
    kinds: csvEnumSchema(OFFICIAL_PERMIT_KINDS)
      .optional()
      .describe(
        `Matches links whose permit is of one of these kinds. Comma-separated list. Possible values: \`${OFFICIAL_PERMIT_KINDS.join("`, `")}\``,
      ),
    createdAfter: instantSchema.optional().describe("Matches links first imported at or after this time"),
    listId: z
      .string()
      .min(1)
      .max(LIST_ID_MAX_LENGTH)
      .optional()
      .describe(
        "Matches only the microwave links on this list. The list must be public or your own, unless you have the `read_all:user_lists` permission",
      ),
    bbox: bboxSchema
      .optional()
      .describe(
        "Matches links with at least one end inside this bounding box, as `west,south,east,north` in degrees. " +
          "West may be greater than east for a box that crosses the 180th meridian",
      ),
    include: csvEnumSchema(MICROWAVE_LINK_INCLUDES).optional(),
    sort: z.enum(MICROWAVE_LINK_SORTS).default("-id").describe(SORT_NOTE),
    limit: z.coerce.number<number>().int().min(1).max(MAX_MICROWAVE_LINK_LIST_LIMIT).default(50).describe(LIMIT_NOTE),
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional().describe(INCLUDE_TOTAL_NOTE),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type MicrowaveLinkListQuery = z.infer<typeof microwaveLinkListQuerySchema>;

export const microwaveLinkListSchema = z.object({
  data: z.array(microwaveLinkSchema),
  paging: pagingSchema,
});
export type MicrowaveLinkList = z.infer<typeof microwaveLinkListSchema>;

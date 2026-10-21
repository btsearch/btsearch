import { z } from "zod/v4";

import {
  CURSOR_OR_OFFSET_ISSUE,
  INCLUDE_NOTE,
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
import { MAX_MICROWAVE_LINK_LIST_LIMIT } from "./constants.ts";
import { OFFICIAL_PERMIT_KINDS, officialPermitKindSchema } from "./officialSites.ts";
import { csvSourceKeysSchema, licenseeSchema } from "./officialSources.ts";

export const MICROWAVE_LINK_INCLUDES = ["licensee"] as const;
export type MicrowaveLinkInclude = (typeof MICROWAVE_LINK_INCLUDES)[number];

export const MICROWAVE_LINK_SORTS = ["-id", "id", "createdAt", "-createdAt", "updatedAt", "-updatedAt"] as const;
export type MicrowaveLinkSort = (typeof MICROWAVE_LINK_SORTS)[number];

const PERMIT_NUMBER_MAX_LENGTH = 100;
const LIST_ID_MAX_LENGTH = 64;

export const microwaveLinkEquipmentSchema = z.object({
  id: z.number().int(),
  name: z.string().describe("The model"),
  manufacturer: z.object({ id: z.number().int(), name: z.string() }).nullable(),
});
export type MicrowaveLinkEquipment = z.infer<typeof microwaveLinkEquipmentSchema>;

const microwaveLinkEndShape = {
  latitude: z.number(),
  longitude: z.number(),
  groundHeightMeters: z.number().nullable().describe("The height of the ground in meters above sea level"),
  city: z.string().nullable().describe("The city or village"),
  province: z.string().nullable().describe("The province or region"),
  street: z.string().nullable(),
  locationDescription: z.string().nullable().describe("The register's description of the place"),
  antenna: microwaveLinkEquipmentSchema.nullable().describe("The antenna model"),
  antennaGainDbi: z.number().nullable(),
  antennaHeightMeters: z.number().nullable().describe("The height of the antenna in meters above the ground"),
};

const microwaveLinkPermitSchema = z.object({
  number: z.string().nullable(),
  kind: officialPermitKindSchema.nullable(),
  issuedOn: daySchema.nullable(),
  expiresOn: daySchema.nullable().describe("The last day the permit is valid. `null` if it does not expire, or if the register does not say"),
});

export const microwaveLinkSchema = z
  .object({
    id: z.number().int(),
    sourceKey: z.string().describe("The key of the source the link comes from, as in `GET /official/sources`"),
    licenseeId: z.number().int().nullable().describe("The licensee that holds the link's permit, as in `GET /official/licensees`"),
    permit: microwaveLinkPermitSchema.describe("The permit the link is operated under. Several links can share one permit"),
    frequencyMhz: z.number(),
    channelNumber: z.number().int().nullable().describe("The number of the channel in its frequency plan"),
    channelWidthMhz: z.number().nullable(),
    planSymbol: z.string().nullable().describe("The symbol of the frequency plan"),
    polarization: z.string().nullable(),
    modulation: z.string().nullable(),
    capacity: z.string().nullable().describe("A plain number is in Mbps. It is text because a register can also write values such as `2x1000`"),
    specsAsOf: z.iso
      .datetime()
      .nullable()
      .describe(
        "When the technical details were last read: the modulation, the capacity, the equipment, gains and losses. " +
          "Some releases leave them out, so this can be earlier than `updatedAt`",
      ),
    tx: z
      .object({
        ...microwaveLinkEndShape,
        eirpDbm: z.number().nullable().describe("The effective isotropic radiated power in dBm"),
        transmitter: microwaveLinkEquipmentSchema.nullable().describe("The transmitter model"),
      })
      .describe("The transmitting end"),
    rx: z
      .object({
        ...microwaveLinkEndShape,
        antennaAttenuationDb: z.number().nullable().describe("The loss between the antenna and the receiver in dB"),
        noiseFigureDb: z.number().nullable(),
        atpcAttenuationDb: z.number().nullable().describe("How far automatic transmit power control (ATPC) can turn the power down, in dB"),
      })
      .describe("The receiving end"),
    createdAt: z.iso.datetime().describe("When the link was first imported"),
    updatedAt: z.iso.datetime(),
    licensee: licenseeSchema.nullable().optional().describe(INCLUDE_NOTE),
  })
  .describe("Text values are passed on as the register writes them, without being normalized");
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
    sort: z.enum(MICROWAVE_LINK_SORTS).default("-id"),
    limit: z.coerce.number<number>().int().min(1).max(MAX_MICROWAVE_LINK_LIST_LIMIT).default(50),
    cursor: cursorSchema.optional(),
    offset: offsetSchema.optional(),
    includeTotal: booleanQuerySchema.optional(),
  })
  .strict()
  .refine(usesCursorOrOffset, CURSOR_OR_OFFSET_ISSUE);
export type MicrowaveLinkListQuery = z.infer<typeof microwaveLinkListQuerySchema>;

export const microwaveLinkListSchema = z.object({
  data: z.array(microwaveLinkSchema),
  paging: pagingSchema,
});
export type MicrowaveLinkList = z.infer<typeof microwaveLinkListSchema>;

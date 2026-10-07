import { z } from "zod/v4";

import { BSIC_MAX, CELL_FIELD_NOTES, PSC_MAX, cellSchema } from "./cells.ts";
import { MAX_ID, csvEnumSchema } from "./common.ts";
import { stationSchema } from "./stations.ts";

export const CELL_MATCH_LIMIT = 5000;
export const OFFICIAL_SITES_PER_CELL = 5;

export const CELL_MATCHES = ["cell", "cellByLac", "station", "none"] as const;
export type CellMatch = (typeof CELL_MATCHES)[number];

export const CELL_MATCH_REASONS = ["cellUnknown", "operatorUnknown", "noIdentifiers"] as const;
export type CellMatchReason = (typeof CELL_MATCH_REASONS)[number];

export const CELL_MATCH_INCLUDES = ["stations", "cells", "officialSites"] as const;
export type CellMatchInclude = (typeof CELL_MATCH_INCLUDES)[number];

export const CELL_DIFFERENCE_FIELDS = ["lac", "rnc", "uarfcn", "tac", "pci", "earfcn", "arfcn", "psc", "bsic"] as const;
export type CellDifferenceField = (typeof CELL_DIFFERENCE_FIELDS)[number];

const MATCH_NOTE =
  "`cell`: a stored cell has these identifiers. " +
  "`cellByLac`: UMTS only, a stored cell has this LAC and CID, but the RNC in the log is missing or different. " +
  "`station`: LTE and NR only, the base station is known by its eNBID or gNBID, but this cell is not stored. `none`: nothing was found";
const DIFFERENCES_NOTE =
  "The values from the log that are missing from the stored cell or differ from it. " +
  "`psc` and `bsic` are only compared while the site has them enabled";

const PLMN_NOTE = "The code of the network the cell belongs to: the MCC followed by the MNC";

const plmnSchema = z.string().regex(/^\d{5,6}$/, "Must be the network code as 5 or 6 digits, for example 310260");

function identifierSchema(max: number) {
  return z.number().int().min(0).max(max);
}

function observedValueSchema(max: number) {
  return identifierSchema(max).nullable().optional().describe("Omit it or send `null` if the log does not have it");
}

export const observedGsmCellSchema = z
  .object({
    rat: z.literal("gsm"),
    plmn: plmnSchema.describe(PLMN_NOTE),
    lac: identifierSchema(65_535).describe(CELL_FIELD_NOTES.lac),
    cid: identifierSchema(65_535).describe(CELL_FIELD_NOTES.cid),
    bsic: observedValueSchema(BSIC_MAX),
  })
  .strict();

export const observedUmtsCellSchema = z
  .object({
    rat: z.literal("umts"),
    plmn: plmnSchema.describe(PLMN_NOTE),
    lac: identifierSchema(65_535).describe(CELL_FIELD_NOTES.lac),
    cid: identifierSchema(65_535).describe(CELL_FIELD_NOTES.cid),
    rnc: observedValueSchema(65_535),
    psc: observedValueSchema(PSC_MAX),
    uarfcn: observedValueSchema(16_383),
  })
  .strict();

export const observedLteCellSchema = z
  .object({
    rat: z.literal("lte"),
    plmn: plmnSchema.describe(PLMN_NOTE),
    enbid: identifierSchema(1_048_575).describe(CELL_FIELD_NOTES.enbid),
    clid: identifierSchema(255).describe(CELL_FIELD_NOTES.clid),
    tac: observedValueSchema(65_535),
    pci: observedValueSchema(503),
    earfcn: observedValueSchema(262_143),
  })
  .strict();

export const observedNrCellSchema = z
  .object({
    rat: z.literal("nr"),
    plmn: plmnSchema.describe(PLMN_NOTE),
    nci: identifierSchema(68_719_476_735)
      .nullable()
      .optional()
      .describe("The 36-bit cell identity of a standalone cell. The server splits it into the gNBID and the cell id"),
    gnbid: identifierSchema(MAX_ID).nullable().optional().describe("Send it only if the log already has the identity split, together with `clid`"),
    clid: identifierSchema(16_383).nullable().optional().describe("Send it only if the log already has the identity split, together with `gnbid`"),
    tac: observedValueSchema(16_777_215),
    pci: observedValueSchema(1007),
    arfcn: observedValueSchema(3_279_165),
  })
  .strict()
  .refine((cell) => (typeof cell.gnbid === "number") === (typeof cell.clid === "number"), {
    path: ["clid"],
    message: "gnbid and clid must be sent together",
  });

export const observedCellSchema = z.discriminatedUnion("rat", [
  observedGsmCellSchema,
  observedUmtsCellSchema,
  observedLteCellSchema,
  observedNrCellSchema,
]);
export type ObservedCell = z.infer<typeof observedCellSchema>;

export const cellMatchBodySchema = z
  .object({ cells: z.array(observedCellSchema).min(1).max(CELL_MATCH_LIMIT).describe("The cells a phone saw, as read from its log") })
  .strict();
export type CellMatchBody = z.infer<typeof cellMatchBodySchema>;

export const cellMatchQuerySchema = z.object({ include: csvEnumSchema(CELL_MATCH_INCLUDES).optional() }).strict();
export type CellMatchQuery = z.infer<typeof cellMatchQuerySchema>;

export const cellDifferenceSchema = z.object({
  field: z.enum(CELL_DIFFERENCE_FIELDS),
  observed: z.number().int().describe("The value in the log"),
  stored: z.number().int().nullable().describe("The value in the database, or `null` if it has none"),
});
export type CellDifference = z.infer<typeof cellDifferenceSchema>;

export const nrIdentitySchema = z.object({
  gnbid: z.number().int().describe(CELL_FIELD_NOTES.gnbid),
  clid: z.number().int().describe(CELL_FIELD_NOTES.clid),
});
export type NrIdentity = z.infer<typeof nrIdentitySchema>;

export const cellMatchResultSchema = z.object({
  operatorId: z.number().int().nullable().describe("The operator the network code belongs to"),
  match: z.enum(CELL_MATCHES).describe(MATCH_NOTE),
  reason: z.enum(CELL_MATCH_REASONS).nullable().describe("Why nothing was found. `null` unless `match` is `none`"),
  stationId: z.number().int().nullable().describe("The station the cell or its base station was found on. `null` if `match` is `none`"),
  cellId: z.number().int().nullable().describe("The stored cell. `null` if `match` is `station` or `none`"),
  isShared: z.boolean().describe("Whether the station belongs to a partner in a shared network rather than to the operator in the log"),
  differences: z.array(cellDifferenceSchema).describe(DIFFERENCES_NOTE),
  nrIdentity: nrIdentitySchema.nullable().describe("NR only. The gNBID and cell id used to look up the cell, or `null` if the cell has none"),
  officialSiteIds: z
    .array(z.number().int())
    .max(OFFICIAL_SITES_PER_CELL)
    .optional()
    .describe("Only returned with `include=officialSites`. Sites in the official register that may hold a cell that was not found"),
});
export type CellMatchResult = z.infer<typeof cellMatchResultSchema>;

export const officialSiteRefSchema = z.object({
  id: z.number().int(),
  siteId: z.string().describe("The id the operator uses for the site, as listed in the register"),
  operatorId: z.number().int(),
  regionId: z.number().int(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    city: z.string().nullable(),
    address: z.string().nullable(),
  }),
});
export type OfficialSiteRef = z.infer<typeof officialSiteRefSchema>;

export const cellMatchAnswerSchema = z.object({
  results: z.array(cellMatchResultSchema).describe("One result per cell sent, in the same order"),
  stations: z
    .array(stationSchema)
    .optional()
    .describe("Only returned with `include=stations`. Every station referenced in the results, listed once, with its location"),
  cells: z.array(cellSchema).optional().describe("Only returned with `include=cells`. Every stored cell referenced in the results, listed once"),
  officialSites: z
    .array(officialSiteRefSchema)
    .optional()
    .describe("Only returned with `include=officialSites`. Every site referenced in the results, listed once"),
});
export type CellMatchAnswer = z.infer<typeof cellMatchAnswerSchema>;

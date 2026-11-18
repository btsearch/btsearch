import { z } from "zod/v4";

import { BSIC_MAX, CELL_FIELD_NOTES, GNBID_MAX, PSC_MAX, cellSchema } from "./cells.ts";
import { csvEnumSchema } from "./common.ts";
import { CELL_MATCHES_FOUND, CELL_NETWORK_MATCHES } from "./constants.ts";
import { observedCellSiteSchema } from "./observed.ts";
import { officialSiteRefSchema } from "./officialSites.ts";
import { stationSchema } from "./stations.ts";

export const CELL_MATCH_LIMIT = 5000;
export const OFFICIAL_SITES_PER_CELL = 5;

const NCI_BITS = 36;

export const CELL_MATCHES = [...CELL_MATCHES_FOUND, "none"] as const;
export type CellMatch = (typeof CELL_MATCHES)[number];

export const CELL_MATCH_REASONS = ["cellUnknown", "operatorUnknown", "noIdentifiers", "analyzerDisabled", "severalStations"] as const;
export type CellMatchReason = (typeof CELL_MATCH_REASONS)[number];

export const CELL_MATCH_INCLUDES = ["stations", "cells", "officialSites", "observedSites"] as const;
export type CellMatchInclude = (typeof CELL_MATCH_INCLUDES)[number];

export const CELL_DIFFERENCE_FIELDS = [
  "lac",
  "rnc",
  "uarfcn",
  "tac",
  "pci",
  "earfcn",
  "arfcn",
  "psc",
  "bsic",
  "gnbid",
  "clid",
  "gnbidLength",
] as const;
export type CellDifferenceField = (typeof CELL_DIFFERENCE_FIELDS)[number];

const MATCH_NOTE =
  "`cell`: a stored cell has these identifiers. For an NR cell sent with an `anchor`, a non-standalone cell of the anchor's station has its PCI and ARFCN. " +
  "`cellByLac`: UMTS only, a stored cell has this LAC and CID, but the RNC in the log is missing or different. " +
  "`station`: LTE and NR only, the base station is known by its eNBID or gNBID, or by the `anchor`, but this cell is not stored. " +
  "If several stations have this eNBID or gNBID, those whose `networkMatch` ranks first are kept (`own`, then `extraCode`, `partner`, `missingCode`), then those with a cell in this cell's TAC. " +
  "If more than one is left, `match` is `none` with the reason `severalStations`. " +
  "`none`: nothing was found";
const DIFFERENCES_NOTE =
  "The values from the log that are missing from the stored cell or differ from it. " +
  "`psc` and `bsic` are only compared while the site has them enabled. " +
  "`network` holds the network code a `missingCode` cell is not recorded as broadcasting. " +
  "A cell found through `extraCode` gets no `tac` or `lac` difference, since each network may use its own. " +
  "`gnbid`, `clid` and `gnbidLength` are compared only for operators whose gNBID is not 24 bits long, so a cell stored with another split shows up here";
const NETWORK_MATCH_NOTE =
  "How the station relates to the network in the log. `own`: it belongs to that network's operator. " +
  "`partner`: it belongs to a partner in a shared network. `extraCode`: the cell broadcasts the network's code besides the owner's. " +
  "`missingCode`: a cell of another operator in the same country has the same identifiers, PCI and channel, but is not recorded as broadcasting the code. " +
  "`null` if `match` is `none`";

const PLMN_NOTE = "The code of the network the cell belongs to: the MCC followed by the MNC";
const ANCHOR_NOTE =
  "For a non-standalone cell without `nci` or `gnbid`: an LTE cell of the station it was seen with, such as its anchor. " +
  "The cell is then looked for among the non-standalone cells of that LTE cell's station by `pci` and `arfcn`. Without both, the anchor is ignored and the cell answers `noIdentifiers`";

const plmnSchema = z.string().regex(/^\d{5,6}$/, "Must be the network code as 5 or 6 digits, for example 310260");

function identifierSchema(max: number) {
  return z.number().int().min(0).max(max);
}

function observedValueSchema(max: number) {
  return identifierSchema(max).nullable().optional();
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
    lac: observedValueSchema(65_535).describe(
      `${CELL_FIELD_NOTES.lac}. Without it, the cell is found by \`rnc\` and \`cid\` only. An \`rnc\` of 0 counts as unknown, and a cell with neither answers \`noIdentifiers\``,
    ),
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
      .describe("The 36-bit cell identity of a standalone cell. The server splits it into the gNBID and the cell id by the operator's gNBID length"),
    gnbid: identifierSchema(GNBID_MAX)
      .nullable()
      .optional()
      .describe("Send it only if the log already has the identity split, together with `clid`. Ignored when `nci` is sent"),
    clid: identifierSchema(16_383)
      .nullable()
      .optional()
      .describe("Send it only if the log already has the identity split, together with `gnbid`. Ignored when `nci` is sent"),
    tac: observedValueSchema(16_777_215),
    pci: observedValueSchema(1007),
    arfcn: observedValueSchema(3_279_165),
    anchor: z
      .object({
        enbid: identifierSchema(1_048_575).describe(CELL_FIELD_NOTES.enbid),
        clid: identifierSchema(255).describe(CELL_FIELD_NOTES.clid),
        tac: observedValueSchema(65_535),
      })
      .strict()
      .nullable()
      .optional()
      .describe(ANCHOR_NOTE),
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

export const cellMatchBodySchema = z.object({ cells: z.array(observedCellSchema).min(1).max(CELL_MATCH_LIMIT) }).strict();
export type CellMatchBody = z.infer<typeof cellMatchBodySchema>;

export const cellMatchQuerySchema = z.object({ include: csvEnumSchema(CELL_MATCH_INCLUDES).optional() }).strict();
export type CellMatchQuery = z.infer<typeof cellMatchQuerySchema>;

const numberDifferenceSchema = z.object({
  field: z.enum(CELL_DIFFERENCE_FIELDS),
  observed: z.number().int(),
  stored: z.number().int().nullable(),
});
export type NumberCellDifference = z.infer<typeof numberDifferenceSchema>;

const networkDifferenceSchema = z.object({
  field: z.literal("network"),
  observed: z.string().describe("The network code from the log"),
  stored: z.null(),
});
export type NetworkCellDifference = z.infer<typeof networkDifferenceSchema>;

export const cellDifferenceSchema = z.union([numberDifferenceSchema, networkDifferenceSchema]);
export type CellDifference = z.infer<typeof cellDifferenceSchema>;

export const nrIdentitySchema = z.object({
  gnbid: z.number().int().describe(CELL_FIELD_NOTES.gnbid),
  clid: z.number().int().describe(CELL_FIELD_NOTES.clid),
  gnbidLength: z.number().int().describe(CELL_FIELD_NOTES.gnbidLength),
});
export type NrIdentity = z.infer<typeof nrIdentitySchema>;

export function splitNci(nci: number, gnbidLength: number): NrIdentity | null {
  const cellsPerGnb = 2 ** (NCI_BITS - gnbidLength);
  const gnbid = Math.floor(nci / cellsPerGnb);
  return gnbid === 0 ? null : { gnbid, clid: nci % cellsPerGnb, gnbidLength };
}

export const cellMatchResultSchema = z.object({
  operatorId: z.number().int().nullable().describe("The operator the network code belongs to"),
  match: z.enum(CELL_MATCHES).describe(MATCH_NOTE),
  reason: z
    .enum(CELL_MATCH_REASONS)
    .nullable()
    .describe(
      "Why `match` is `none`, `null` otherwise. With `analyzerDisabled`, the analyzer is switched off in the network's country and `operatorId` is `null`. " +
        "With `severalStations`, the cell is not stored and several stations have its eNBID or gNBID, with nothing to tell them apart",
    ),
  stationId: z.number().int().nullable().describe("The station the cell or its base station was found on. `null` if `match` is `none`"),
  stationIds: z
    .array(z.number().int())
    .describe(
      "The stations the result points at, in ascending order: the cell's station for `cell` and `cellByLac`, every station with the cell's eNBID or gNBID, or with its anchor's eNBID, for `station` and `severalStations`. Empty otherwise",
    ),
  cellId: z.number().int().nullable().describe("`null` if `match` is `station` or `none`"),
  isShared: z.boolean().describe("Whether the station belongs to a partner in a shared network rather than to the operator in the log"),
  networkMatch: z.enum(CELL_NETWORK_MATCHES).nullable().describe(NETWORK_MATCH_NOTE),
  differences: z.array(cellDifferenceSchema).describe(DIFFERENCES_NOTE),
  nrIdentity: nrIdentitySchema
    .nullable()
    .describe("NR only. The gNBID and cell id used to look up the cell, and the gNBID length they were split by"),
  officialSiteIds: z
    .array(z.number().int())
    .max(OFFICIAL_SITES_PER_CELL)
    .optional()
    .describe("Only returned with `include=officialSites`. Sites in the official register that may hold a cell that was not found"),
  observedCellId: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      "Only returned with `include=observedSites`. The observed cell with this identity, " +
        "or the cell it copies when phones uploaded a shared cell under another network. `null` when `observedSiteId` is",
    ),
  observedSiteId: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe(
      "Only returned with `include=observedSites`. Where uploads place the cell, as you may see the site in `GET /observed/sites/{id}`. " +
        "`null` when phones have not uploaded the cell, when it is on no site or on one you may not see, when observed data is switched off, " +
        "and when `measurements` is not among the `tools` of the network's country. " +
        "Also `null` for a cell sent without its own identity: a UMTS cell without `rnc`, or a non-standalone NR cell found by its `anchor`",
    ),
});
export type CellMatchResult = z.infer<typeof cellMatchResultSchema>;

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
  observedSites: z
    .array(observedCellSiteSchema)
    .optional()
    .describe("Only returned with `include=observedSites`. Every site referenced in the results, listed once"),
});
export type CellMatchAnswer = z.infer<typeof cellMatchAnswerSchema>;

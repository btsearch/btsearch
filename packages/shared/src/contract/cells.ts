import { z } from "zod/v4";

import { UNKNOWN_BAND_NOTE, bandSchema } from "./bands.ts";
import { INCLUDE_NOTE } from "./common.ts";

export const CELL_RATS = ["gsm", "umts", "lte", "nr"] as const;
export type CellRat = (typeof CELL_RATS)[number];

export const CELL_TYPES = ["macro", "micro", "pico", "femto"] as const;
export type CellType = (typeof CELL_TYPES)[number];

export const NR_MODES = ["nsa", "sa"] as const;
export type NrMode = (typeof NR_MODES)[number];

export const BSIC_MAX = 63;
export const PSC_MAX = 511;
export const GNBID_MIN_LENGTH = 22;
export const GNBID_MAX_LENGTH = 32;
export const DEFAULT_GNBID_LENGTH = 24;

export const CELL_FIELD_NOTES = {
  lac: "Location area code",
  cid: "Cell id",
  rnc: "Radio network controller id",
  uarfcn: "UARFCN, the downlink channel number",
  tac: "Tracking area code",
  enbid: "eNBID, the id of the cell's base station",
  gnbid: "gNBID, the id of the cell's base station",
  gnbidLength: "The length of the gNBID in bits, from 22 to 32. The remaining bits of the 36-bit nci hold clid",
  clid: "The cell's id within its base station",
  pci: "Physical cell id",
  earfcn: "EARFCN, the downlink channel number",
  arfcn: "NR-ARFCN, the downlink channel number",
  mode: "Whether the cell is non-standalone (`nsa`) or standalone (`sa`)",
  isEGsm: "Whether the cell uses the extended GSM 900 band (E-GSM)",
  supportsIot: "Whether the cell supports IoT (NB-IoT or LTE-M)",
  supportsRedCap: "Whether the cell supports RedCap (reduced-capability NR devices)",
} as const;

const SWITCHED_OFF_NOTE = "`null` if unknown, and always `null` while the site has it disabled";
const identifierSchema = z.number().int().nullable();

const cellShape = {
  id: z.number().int(),
  stationId: z.number().int(),
  bandId: z.number().int().nullable().describe(UNKNOWN_BAND_NOTE),
  sectorId: z.number().int().nullable().describe("The sector the cell is attached to, or `null` if it has none"),
  cellType: z.enum(CELL_TYPES).nullable(),
  isConfirmed: z.boolean().describe("Whether the cell is marked as confirmed. Only editors can set it"),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  band: bandSchema.optional().describe(INCLUDE_NOTE),
};

export const gsmCellSchema = z.object({
  ...cellShape,
  rat: z.literal("gsm"),
  lac: z.number().int().describe(CELL_FIELD_NOTES.lac),
  cid: z.number().int().describe(CELL_FIELD_NOTES.cid),
  isEGsm: z.boolean().describe(CELL_FIELD_NOTES.isEGsm),
  bsic: identifierSchema.describe(`Base station identity code, 0 to ${BSIC_MAX}. ${SWITCHED_OFF_NOTE}`),
});

export const umtsCellSchema = z.object({
  ...cellShape,
  rat: z.literal("umts"),
  lac: identifierSchema.describe(CELL_FIELD_NOTES.lac),
  rnc: identifierSchema.describe(CELL_FIELD_NOTES.rnc),
  cid: identifierSchema.describe(CELL_FIELD_NOTES.cid),
  longCid: identifierSchema.describe("The long cell id, equal to `rnc * 65536 + cid`. `null` if `rnc` is unknown"),
  psc: identifierSchema.describe(`Primary scrambling code, 0 to ${PSC_MAX}. ${SWITCHED_OFF_NOTE}`),
  uarfcn: identifierSchema.describe(CELL_FIELD_NOTES.uarfcn),
});

export const lteCellSchema = z.object({
  ...cellShape,
  rat: z.literal("lte"),
  tac: identifierSchema.describe(CELL_FIELD_NOTES.tac),
  enbid: identifierSchema.describe(CELL_FIELD_NOTES.enbid),
  clid: identifierSchema.describe(CELL_FIELD_NOTES.clid),
  eci: identifierSchema.describe("The E-UTRAN cell identity, equal to `enbid * 256 + clid`. `null` if `enbid` is unknown"),
  pci: identifierSchema.describe(CELL_FIELD_NOTES.pci),
  earfcn: identifierSchema.describe(CELL_FIELD_NOTES.earfcn),
  supportsIot: z.boolean().describe(CELL_FIELD_NOTES.supportsIot),
});

export const nrCellSchema = z.object({
  ...cellShape,
  rat: z.literal("nr"),
  mode: z.enum(NR_MODES).describe(CELL_FIELD_NOTES.mode),
  tac: identifierSchema.describe(CELL_FIELD_NOTES.tac),
  gnbid: identifierSchema.describe(CELL_FIELD_NOTES.gnbid),
  gnbidLength: identifierSchema.describe(CELL_FIELD_NOTES.gnbidLength),
  clid: identifierSchema.describe(CELL_FIELD_NOTES.clid),
  nci: identifierSchema.describe("The NR cell identity, made up of `gnbid` and `clid`. `null` if either is unknown"),
  pci: identifierSchema.describe(CELL_FIELD_NOTES.pci),
  arfcn: identifierSchema.describe(CELL_FIELD_NOTES.arfcn),
  supportsRedCap: z.boolean().describe(CELL_FIELD_NOTES.supportsRedCap),
});

export const cellSchema = z.discriminatedUnion("rat", [gsmCellSchema, umtsCellSchema, lteCellSchema, nrCellSchema]);
export type Cell = z.infer<typeof cellSchema>;

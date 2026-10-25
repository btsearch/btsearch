import { z } from "zod/v4";

import { bandSchema } from "./bands.ts";
import { INCLUDE_NOTE, daySchema } from "./common.ts";

export const CELL_TYPES = ["macro", "micro", "pico", "femto"] as const;
export type CellType = (typeof CELL_TYPES)[number];

export const NR_MODES = ["nsa", "sa"] as const;
export type NrMode = (typeof NR_MODES)[number];

export const BSIC_MAX = 63;
export const PSC_MAX = 511;
export const GNBID_MAX = 4_294_967_295;

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

const SWITCHED_OFF_NOTE = "Always `null` while the site has it disabled";
const identifierSchema = z.number().int().nullable();

export const cellSightingsSchema = z.object({
  firstSeenOn: daySchema.describe("The first day phones measured it, in UTC"),
  lastSeenOn: daySchema.describe(
    "The latest day phones measured it, in UTC. Refreshed daily, while an observed cell's `lastSeenOn` follows each processed upload",
  ),
  bandwidthKhz: z
    .number()
    .int()
    .nullable()
    .describe("The downlink bandwidth phones measured: the latest value two people reported. `null` until then, and always for GSM and UMTS"),
});
export type CellSightings = z.infer<typeof cellSightingsSchema>;

const cellShape = {
  id: z.number().int(),
  stationId: z.number().int(),
  bandId: z.number().int().nullable(),
  sectorId: z.number().int().nullable(),
  cellType: z.enum(CELL_TYPES).nullable(),
  isConfirmed: z.boolean().describe("Only editors can set it"),
  notes: z.string().nullable(),
  plmns: z.array(z.string()).describe("Every network the cell broadcasts. The first is the station owner's main code, when it has one"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  band: bandSchema.optional().describe(INCLUDE_NOTE),
  sightings: cellSightingsSchema
    .nullable()
    .optional()
    .describe(`${INCLUDE_NOTE}. \`null\` if no phone has measured the cell. The \`observations\` setting does not hide it`),
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
  longCid: identifierSchema.describe("The long cell id, equal to `rnc * 65536 + cid`"),
  psc: identifierSchema.describe(`Primary scrambling code, 0 to ${PSC_MAX}. ${SWITCHED_OFF_NOTE}`),
  uarfcn: identifierSchema.describe(CELL_FIELD_NOTES.uarfcn),
});

export const lteCellSchema = z.object({
  ...cellShape,
  rat: z.literal("lte"),
  tac: identifierSchema.describe(CELL_FIELD_NOTES.tac),
  enbid: identifierSchema.describe(CELL_FIELD_NOTES.enbid),
  clid: identifierSchema.describe(CELL_FIELD_NOTES.clid),
  eci: identifierSchema.describe("The E-UTRAN cell identity, equal to `enbid * 256 + clid`"),
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
  nci: identifierSchema.describe("The NR cell identity, equal to `gnbid * 2^(36 - gnbidLength) + clid`"),
  pci: identifierSchema.describe(CELL_FIELD_NOTES.pci),
  arfcn: identifierSchema.describe(CELL_FIELD_NOTES.arfcn),
  supportsRedCap: z.boolean().describe(CELL_FIELD_NOTES.supportsRedCap),
});

export const cellSchema = z.discriminatedUnion("rat", [gsmCellSchema, umtsCellSchema, lteCellSchema, nrCellSchema]);
export type Cell = z.infer<typeof cellSchema>;

const IMPLIED_BY_STATION = { stationId: true } as const;

export const stationGsmCellSchema = gsmCellSchema.omit(IMPLIED_BY_STATION);
export const stationUmtsCellSchema = umtsCellSchema.omit(IMPLIED_BY_STATION);
export const stationLteCellSchema = lteCellSchema.omit(IMPLIED_BY_STATION);
export const stationNrCellSchema = nrCellSchema.omit(IMPLIED_BY_STATION);

export const stationCellSchema = z.discriminatedUnion("rat", [
  stationGsmCellSchema,
  stationUmtsCellSchema,
  stationLteCellSchema,
  stationNrCellSchema,
]);
export type StationCell = z.infer<typeof stationCellSchema>;

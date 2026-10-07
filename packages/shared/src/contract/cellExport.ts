import { z } from "zod/v4";

import {
  type CLFDescriptionTemplateRat,
  CLF_DESCRIPTION_TEMPLATE_DEFAULTS,
  CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH,
  CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT,
  CLF_EXPORT_FORMATS,
} from "../clfExportTemplates.ts";
import { csvBandIdsSchema } from "./bands.ts";
import { CELL_RATS } from "./cells.ts";
import { booleanQuerySchema, csvCountryCodesSchema, csvEnumSchema, csvIdsSchema, instantSchema } from "./common.ts";

export const CELL_EXPORT_TEMPLATE_PARAMS = {
  GSM: "templateGsm",
  UMTS: "templateUmts",
  LTE: "templateLte",
  NR_NSA: "templateNrNsa",
  NR: "templateNr",
} as const satisfies Record<CLFDescriptionTemplateRat, string>;

const templateSchema = z.string().trim().min(1).max(CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH);

const FORMAT_NOTE =
  "The file format. `2.0`, `2.1`, `3.0-dec`, `3.0-hex` and `4.0` are CLF versions, of which `2.0` and `3.0-hex` write cell identifiers " +
  "in hexadecimal and the others in decimal. `ntm` is the NetMonster format and `netmonitor` the Netmonitor CSV format";
const OPERATORS_NOTE =
  "Exports only the cells of these operators. For a shared network, the cells of its members are exported too. Comma-separated ids";
const SUPPORTS_IOT_NOTE = "`true` exports only LTE cells that support IoT and NR cells that support RedCap. `false` leaves those cells out";
const INCLUDE_IOT_NOTE = "`true` adds LTE IoT and NR RedCap cells to the selected RATs. `supportsIot`, when present, still filters the result";
const NR_SEPARATELY_NOTE = "Only applies to `format=ntm`. If `true`, non-standalone NR cells are written with the TAC of the station's LTE cells";

function templateNote(cells: string, rat: CLFDescriptionTemplateRat): string {
  const placeholders: readonly string[] = CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT[rat];
  return (
    `The template for the description of ${cells} cells, up to ${CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH} characters. ` +
    `Defaults to \`${CLF_DESCRIPTION_TEMPLATE_DEFAULTS[rat]}\`. Placeholders: \`{${placeholders.join("}`, `{")}}\``
  );
}

export const cellExportQuerySchema = z
  .object({
    format: z.enum(CLF_EXPORT_FORMATS).default("4.0").describe(FORMAT_NOTE),
    countryCodes: csvCountryCodesSchema.optional(),
    regionIds: csvIdsSchema.optional(),
    operatorIds: csvIdsSchema.optional().describe(OPERATORS_NOTE),
    bandIds: csvBandIdsSchema.optional(),
    rats: csvEnumSchema(CELL_RATS).optional(),
    includeIot: booleanQuerySchema.optional().describe(INCLUDE_IOT_NOTE),
    supportsIot: booleanQuerySchema.optional().describe(SUPPORTS_IOT_NOTE),
    updatedAfter: instantSchema.optional().describe("Exports only cells changed at or after this time"),
    templateGsm: templateSchema.optional().describe(templateNote("GSM", "GSM")),
    templateUmts: templateSchema.optional().describe(templateNote("UMTS", "UMTS")),
    templateLte: templateSchema.optional().describe(templateNote("LTE", "LTE")),
    templateNrNsa: templateSchema.optional().describe(templateNote("non-standalone NR", "NR_NSA")),
    templateNr: templateSchema.optional().describe(templateNote("standalone NR", "NR")),
    displayNrSeparately: booleanQuerySchema.optional().describe(NR_SEPARATELY_NOTE),
  })
  .strict();
export type CellExportQuery = z.infer<typeof cellExportQuerySchema>;

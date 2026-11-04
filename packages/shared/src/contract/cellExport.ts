import { z } from "zod/v4";

import {
  type CLFDescriptionTemplateRat,
  CLF_DESCRIPTION_TEMPLATE_DEFAULTS,
  CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH,
  CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT,
  CLF_EXPORT_FORMATS,
} from "../clfExportTemplates.ts";
import { csvBandIdsSchema } from "./bands.ts";
import { NR_MODES } from "./cells.ts";
import { csvCountryCodesSchema, csvEnumSchema, csvIdsSchema, instantSchema } from "./common.ts";
import { CELL_RATS, IOT_RATS } from "./constants.ts";

const templateSchema = z.string().trim().min(1).max(CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH);

const FORMAT_NOTE =
  "`2.0`, `2.1`, `3.0-dec`, `3.0-hex` and `4.0` are CLF versions, of which `2.0` and `3.0-hex` write cell identifiers " +
  "in hexadecimal and the others in decimal. `ntm` is the NetMonster format and `netmonitor` the Netmonitor CSV format";
const OPERATORS_NOTE = "For a shared network, the cells of its members are exported too. Comma-separated ids";
const IOT_RATS_NOTE =
  "Adds the IoT cells of these technologies to the cells in `rats`: `lte` for NB-IoT and LTE-M cells, `nr` for RedCap cells. " +
  "For example, `rats=gsm&iotRats=lte` exports every GSM cell and the LTE IoT cells, and `iotRats=lte` alone only the LTE IoT cells. Comma-separated list";
const NR_MODES_NOTE =
  "Exports only NR cells in these modes. Defaults to `sa`, so you only get `nsa` cells when you ask for them. " +
  "They need `format=ntm` and are written with NCI `1` and the TAC of the station's LTE cells, or an unknown TAC when those cells have different ones. " +
  `Comma-separated list. Possible values: \`${NR_MODES.join("`, `")}\``;
const NSA_FORMAT_ISSUE = { path: ["nrModes"], message: "`nsa` cells can only be exported with `format=ntm`" };

function templateNote(cells: string, rat: CLFDescriptionTemplateRat): string {
  const placeholders: readonly string[] = CLF_DESCRIPTION_TEMPLATE_PLACEHOLDERS_BY_RAT[rat];
  return (
    `The template for the description of ${cells} cells. ` +
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
    iotRats: csvEnumSchema(IOT_RATS).optional().describe(IOT_RATS_NOTE),
    nrModes: csvEnumSchema(NR_MODES).optional().describe(NR_MODES_NOTE),
    updatedAfter: instantSchema.optional().describe("Exports only cells changed at or after this time"),
    templateGsm: templateSchema.optional().describe(templateNote("GSM", "GSM")),
    templateUmts: templateSchema.optional().describe(templateNote("UMTS", "UMTS")),
    templateLte: templateSchema.optional().describe(templateNote("LTE", "LTE")),
    templateNrNsa: templateSchema.optional().describe(templateNote("non-standalone NR", "NR_NSA")),
    templateNr: templateSchema.optional().describe(templateNote("standalone NR", "NR")),
  })
  .strict()
  .refine((query) => query.format === "ntm" || !query.nrModes?.includes("nsa"), NSA_FORMAT_ISSUE);
export type CellExportQuery = z.infer<typeof cellExportQuerySchema>;

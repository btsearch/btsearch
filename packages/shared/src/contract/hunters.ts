import { z } from "zod/v4";

import { csvCountryCodesSchema, csvIdsSchema, cursorSchema, limitSchema, pagingSchema, userRefSchema } from "./common.ts";
import { userContactSchema } from "./users.ts";

export const hunterListQuerySchema = z
  .object({
    countryCodes: csvCountryCodesSchema
      .optional()
      .describe("Only hunters who chose a region in one of these countries. Comma-separated country codes"),
    regionIds: csvIdsSchema.optional().describe("Only hunters who chose one of these regions. Comma-separated ids"),
    limit: limitSchema,
    cursor: cursorSchema.optional(),
  })
  .strict();
export type HunterListQuery = z.infer<typeof hunterListQuerySchema>;

export const hunterSchema = userRefSchema.extend({
  contact: userContactSchema.nullable().describe("`null` if the hunter shows no contact details"),
  regionIds: z
    .array(z.number().int())
    .describe("Every region the hunter chose in a country you can see, also when you filter by `countryCodes` or `regionIds`"),
});
export type Hunter = z.infer<typeof hunterSchema>;

export const hunterListSchema = z.object({
  data: z.array(hunterSchema),
  paging: pagingSchema,
});
export type HunterList = z.infer<typeof hunterListSchema>;

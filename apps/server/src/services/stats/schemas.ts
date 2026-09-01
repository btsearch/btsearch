import { z } from "zod/v4";

export const statsOperatorSchema = z.object({
  id: z.number(),
  name: z.string(),
  mnc: z.number().nullable(),
});

export type StatsOperator = z.infer<typeof statsOperatorSchema>;

export const statsBandSchema = z.object({
  id: z.number(),
  name: z.string(),
  rat: z.string(),
});

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

export const statsResponseSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    lastUpdated: z.iso.datetime({ offset: true }),
  });

export interface StatsResponse<T> {
  data: T;
  lastUpdated: string;
}

export function createStatsResponse<T>(data: T): StatsResponse<T> {
  return { data, lastUpdated: new Date().toISOString() };
}

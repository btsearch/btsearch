import { ukeRadiolines } from "@openbts/drizzle";
import { createInsertSchema, createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const ukeRadiolineInsertSchema = createInsertSchema(ukeRadiolines);
const ukeRadiolineSelectSchema = createSelectSchema(ukeRadiolines);

export type UkeRadiolineInsert = z.infer<typeof ukeRadiolineInsertSchema>;
export type UkeRadiolineSelect = z.infer<typeof ukeRadiolineSelectSchema>;

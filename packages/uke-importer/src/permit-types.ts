import { ukePermits } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const ukePermitSelectSchema = createSelectSchema(ukePermits);

export type UkePermitKeyInput = Pick<
  z.infer<typeof ukePermitSelectSchema>,
  "uke_station_id" | "band_id" | "decision_number" | "decision_type" | "expiry_date"
>;

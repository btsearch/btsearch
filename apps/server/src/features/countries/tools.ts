import { countries } from "@openbts/drizzle";
import { eq } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";

export async function assertAnalyzerEnabled(countryCode: string | null | undefined): Promise<void> {
  if (!countryCode) return;

  const [country] = await db.select({ tools: countries.tools }).from(countries).where(eq(countries.code, countryCode)).limit(1);
  const isSwitchedOff = country !== undefined && !country.tools.includes("analyzer");
  if (isSwitchedOff) throw new ErrorResponse("FEATURE_DISABLED", { message: `The analyzer is switched off in ${countryCode}` });
}

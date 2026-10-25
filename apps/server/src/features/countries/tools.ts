import { countries } from "@openbts/drizzle";
import type { CountryTool } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";

async function assertToolEnabled(countryCode: string | null | undefined, tool: CountryTool, message: string): Promise<void> {
  if (!countryCode) return;

  const [country] = await db.select({ tools: countries.tools }).from(countries).where(eq(countries.code, countryCode)).limit(1);
  const isSwitchedOff = country !== undefined && !country.tools.includes(tool);
  if (isSwitchedOff) throw new ErrorResponse("FEATURE_DISABLED", { message });
}

export async function assertAnalyzerEnabled(countryCode: string | null | undefined): Promise<void> {
  await assertToolEnabled(countryCode, "analyzer", `The analyzer is switched off in ${countryCode}`);
}

export async function assertMeasurementsEnabled(countryCode: string | null | undefined): Promise<void> {
  await assertToolEnabled(countryCode, "measurements", `Measurements are switched off in ${countryCode}`);
}

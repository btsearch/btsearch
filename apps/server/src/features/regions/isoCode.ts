import { regions } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";

export function assertIsoCodeMatchesCountry(isoCode: string | null, countryCode: string): void {
  if (isoCode === null || isoCode.startsWith(`${countryCode}-`)) return;
  throw new ErrorResponse("BAD_REQUEST", { message: `isoCode must start with ${countryCode}-` });
}

export async function assertIsoCodeFree(tx: DbTx, isoCode: string | null, id?: number): Promise<void> {
  if (isoCode === null) return;

  const [taken] = await tx
    .select({ id: regions.id })
    .from(regions)
    .where(and(eq(regions.isoCode, isoCode), id === undefined ? undefined : ne(regions.id, id)))
    .limit(1);
  if (taken) throw new ErrorResponse("CONFLICT", { message: "Another region already has this isoCode" });
}

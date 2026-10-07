import { brands } from "@openbts/drizzle";
import { and, eq, ne } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";

export async function assertBrandSlugFree(tx: DbTx, slug: string, id?: number): Promise<void> {
  const [sameSlug] = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.slug, slug), id === undefined ? undefined : ne(brands.id, id)))
    .limit(1);
  if (sameSlug) throw new ErrorResponse("CONFLICT", { message: "A brand with this slug already exists" });
}

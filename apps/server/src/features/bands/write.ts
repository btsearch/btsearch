import { bands } from "@openbts/drizzle";
import { findCatalogBand, resolveCatalogBand } from "@openbts/shared/bandCatalog";
import { and, eq, isNull, ne } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { BandRow } from "./serialize.js";

type BandIdentity = { id?: number; rat: BandRow["rat"]; variant: BandRow["variant"]; code: string | null; name?: string };
type CodelessBand = Pick<BandRow, "id" | "rat" | "value" | "duplex" | "variant">;

export function requireCatalogBand(code: string) {
  const catalog = findCatalogBand(code);
  if (!catalog) throw new ErrorResponse("BAD_REQUEST", { message: "Unknown band code" });

  const { duplex, rat, labelMhz } = catalog;
  if (duplex === "SUL") throw new ErrorResponse("BAD_REQUEST", { message: "An uplink-only band cannot hold cells" });
  return { rat, duplex: rat === "GSM" ? null : duplex, labelMhz };
}

function hasKnownDuplex({ rat, duplex }: Pick<BandRow, "rat" | "duplex">): boolean {
  return duplex !== null || rat === "GSM";
}

export async function assertBandFree(tx: DbTx, { id, rat, variant, code, name }: BandIdentity): Promise<void> {
  const isOther = id === undefined ? undefined : ne(bands.id, id);

  if (code !== null) {
    const sameRat = await tx
      .select()
      .from(bands)
      .where(and(eq(bands.rat, rat), eq(bands.variant, variant), isOther));
    const duplicate = sameRat.filter((row) => row.code !== null || hasKnownDuplex(row)).find((row) => resolveCatalogBand(row)?.code === code);
    if (duplicate) throw new ErrorResponse("CONFLICT", { message: `This band already exists as "${duplicate.name}"` });
  }
  if (name === undefined) return;

  const [nameTaken] = await tx
    .select({ id: bands.id })
    .from(bands)
    .where(and(eq(bands.name, name), isOther))
    .limit(1);
  if (nameTaken) throw new ErrorResponse("CONFLICT", { message: "This band name is already in use" });
}

export async function assertCodelessBandFree(tx: DbTx, { id, rat, value, duplex, variant }: CodelessBand): Promise<void> {
  const [duplicate] = await tx
    .select({ name: bands.name })
    .from(bands)
    .where(
      and(
        ne(bands.id, id),
        eq(bands.rat, rat),
        value === null ? isNull(bands.value) : eq(bands.value, value),
        duplex === null ? isNull(bands.duplex) : eq(bands.duplex, duplex),
        eq(bands.variant, variant),
        isNull(bands.code),
      ),
    )
    .limit(1);
  if (duplicate) throw new ErrorResponse("CONFLICT", { message: `This band already exists as "${duplicate.name}"` });
  if (!hasKnownDuplex({ rat, duplex })) return;

  const catalog = resolveCatalogBand({ rat, value, duplex, variant });
  if (catalog) await assertBandFree(tx, { id, rat, variant, code: catalog.code });
}

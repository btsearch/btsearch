import { brands } from "@openbts/drizzle";
import type { Brand } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const brandSelectSchema = createSelectSchema(brands);

export type BrandRow = z.infer<typeof brandSelectSchema>;

export function toBrand(row: BrandRow): Brand {
  const { logoFile, logoWidth: width, logoHeight: height } = row;
  const logo = logoFile !== null && width !== null && height !== null ? { url: `/uploads/${logoFile}`, width, height } : null;

  return { id: row.id, slug: row.slug, name: row.name, color: row.color, logo };
}

import { z } from "zod/v4";

import { AT_LEAST_ONE_FIELD_ISSUE, hasAnyField, idParamSchema } from "./common.ts";

const brandSlugSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lower-case letters and digits, with single hyphens between words");
const brandNameSchema = z.string().trim().min(1).max(100);
const brandColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a color written as #RRGGBB")
  .transform((color) => color.toUpperCase());

const SLUG_NOTE = "A unique key for the brand, made of lower-case letters and digits with single hyphens between words";
const COLOR_NOTE = "The brand's color as `#RRGGBB`";

export const brandLogoSchema = z.object({
  url: z.string().describe("The path of the logo file, from the site root and not from the API base path. It changes whenever the logo is replaced"),
  width: z.number().int().positive().describe("Width in pixels. For an SVG, the width of its `viewBox`"),
  height: z.number().int().positive().describe("Height in pixels. For an SVG, the height of its `viewBox`"),
});
export type BrandLogo = z.infer<typeof brandLogoSchema>;

export const brandSchema = z.object({
  id: z.number().int(),
  slug: z.string().describe(SLUG_NOTE),
  name: z.string(),
  color: z.string().describe(`${COLOR_NOTE}, in upper case`),
  logo: brandLogoSchema.nullable().describe("The brand's logo, or `null` if none has been uploaded"),
});
export type Brand = z.infer<typeof brandSchema>;

export const brandParamsSchema = z.object({ id: idParamSchema });

export const brandCreateSchema = z
  .object({
    slug: brandSlugSchema.describe(SLUG_NOTE),
    name: brandNameSchema,
    color: brandColorSchema.describe(`${COLOR_NOTE}. Stored in upper case`),
  })
  .strict();
export type BrandCreate = z.infer<typeof brandCreateSchema>;

export const BRAND_LOGO_MAX_BYTES = 512 * 1024;

export const brandLogoUploadSchema = z.object({
  file: z.file().max(BRAND_LOGO_MAX_BYTES).describe("An SVG, PNG or WebP image, up to 512 KB"),
});

export const brandUpdateSchema = z
  .object({
    slug: brandSlugSchema.optional().describe(SLUG_NOTE),
    name: brandNameSchema.optional(),
    color: brandColorSchema.optional().describe(`${COLOR_NOTE}. Stored in upper case`),
  })
  .strict()
  .refine(hasAnyField, AT_LEAST_ONE_FIELD_ISSUE);
export type BrandUpdate = z.infer<typeof brandUpdateSchema>;

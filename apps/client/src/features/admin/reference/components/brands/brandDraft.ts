import type { Brand, BrandCreate } from "../../types";
import { foldText } from "@/lib/foldText";

type BrandDraft = {
  name: string;
  slug: string;
  colorText: string;
  color: string;
};

export const BRAND_NAME_MAX_LENGTH = 100;
export const BRAND_SLUG_MAX_LENGTH = 64;
export const BRAND_COLOR_TEXT_LENGTH = 7;
export const BRAND_VALUE_KEYS = ["slug", "name", "color"] as const satisfies readonly (keyof BrandCreate)[];
export const BRAND_COLOR_PRESETS = [
  "#E2007A",
  "#F43F5E",
  "#F59E0B",
  "#24B570",
  "#14B8A6",
  "#0082F4",
  "#0E4AC0",
  "#8549CE",
  "#A2334C",
  "#64748B",
] as const;

const NEW_BRAND_COLOR = "#449AC0";
const BRAND_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNFINISHED_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-$/;
const BRAND_COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const UNFINISHED_COLOR_PATTERN = /^#[0-9A-F]{0,5}$/;
const NON_SLUG_CHARACTERS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function toBrandDraft(brand: Brand | undefined): BrandDraft {
  if (brand === undefined) return { name: "", slug: "", colorText: NEW_BRAND_COLOR, color: NEW_BRAND_COLOR };
  return { name: brand.name, slug: brand.slug, colorText: brand.color, color: brand.color };
}

export function toBrandValues(brand: Brand): BrandCreate {
  return { slug: brand.slug, name: brand.name, color: brand.color };
}

export function toBrandSlug(name: string): string {
  return foldText(name).replace(NON_SLUG_CHARACTERS, "-").replace(EDGE_HYPHENS, "").slice(0, BRAND_SLUG_MAX_LENGTH).replace(EDGE_HYPHENS, "");
}

export function isBrandSlug(slug: string): boolean {
  return slug.length <= BRAND_SLUG_MAX_LENGTH && BRAND_SLUG_PATTERN.test(slug);
}

export function isUnfinishedBrandSlug(slug: string): boolean {
  return UNFINISHED_SLUG_PATTERN.test(slug);
}

export function parseBrandColor(text: string): string | null {
  const color = text.trim().toUpperCase();
  return BRAND_COLOR_PATTERN.test(color) ? color : null;
}

export function isUnfinishedBrandColor(text: string): boolean {
  const color = text.trim().toUpperCase();
  return color === "" || UNFINISHED_COLOR_PATTERN.test(color);
}

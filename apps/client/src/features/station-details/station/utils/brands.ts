import type { Brand, Operator } from "../types";

export const FALLBACK_BRAND_COLOR = "#3b82f6";

export function findBrand(brands: readonly Brand[] | undefined, brandId: number | null | undefined): Brand | null {
  if (brands === undefined || brandId === null || brandId === undefined) return null;
  return brands.find((brand) => brand.id === brandId) ?? null;
}

export function getOperatorBrand(operator: Pick<Operator, "brandId"> | null | undefined, brands: readonly Brand[] | undefined): Brand | null {
  return findBrand(brands, operator?.brandId);
}

export function getBrandColor(brand: Pick<Brand, "color"> | null | undefined): string {
  return brand?.color ?? FALLBACK_BRAND_COLOR;
}

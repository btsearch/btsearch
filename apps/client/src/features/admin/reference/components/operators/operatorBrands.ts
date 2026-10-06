import type { Brand } from "../../types";

export function findBrand(brands: readonly Brand[] | undefined, brandId: number | null): Brand | null {
  if (brandId === null) return null;
  return brands?.find((brand) => brand.id === brandId) ?? null;
}

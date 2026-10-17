import type { Brand, Operator } from "./api.js";

const OPERATOR_DOT: Record<string, string> = {
  "T-Mobile": "🔴",
  Orange: "🟠",
  Play: "🟣",
  Plus: "🟢",
};

export function operatorDot(name: string): string {
  for (const [key, dot] of Object.entries(OPERATOR_DOT)) if (name.includes(key)) return `${dot} `;
  return "";
}

export function operatorName(operator: Operator | null, brands: readonly Brand[]): string {
  if (!operator) return "Nieznany operator";
  return brands.find((brand) => brand.id === operator.brandId)?.name ?? operator.name;
}

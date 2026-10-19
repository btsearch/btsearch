import type { OperatorNameInput } from "../../core/conventions.ts";
import { TMOBILE_PLMN } from "../operators.ts";

function normalizeCity(city: string): string {
  return (city.split(" - ")[0] ?? city)
    .trim()
    .replace(/Ł/g, "L")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
}

export function suggestOperatorName({ operator, siteId, city, partnerName }: OperatorNameInput): string | null {
  if (operator.primaryPlmn !== TMOBILE_PLMN) return partnerName || null;
  if (!siteId || siteId.startsWith("N") || !city) return null;
  return `${normalizeCity(city)}_${siteId}`;
}

import { getOperatorSortIndex, resolveOperatorMnc } from "@openbts/shared/operatorUtils";

import type { StatsOperator } from "../../features/stats/schemas.ts";
import type { DatabaseMonthlyStats } from "./data.ts";

export type Language = "pl" | "en";
export type Formatters = { number: (value: number) => string; percent: (value: number) => string };
type OperatorRow = DatabaseMonthlyStats["operators"][number];

export const LOCALES: Record<Language, string> = { pl: "pl-PL", en: "en-US" };

export const OPERATOR_METRICS = [
  { key: "stations", added: "stations_added" },
  { key: "cells", added: "cells_added" },
  { key: "pcis", added: "pcis_added" },
  { key: "azimuths", added: "azimuths_added" },
  { key: "networks_ids", added: "networks_ids_added" },
  { key: "photos", added: "photos_added" },
] as const satisfies readonly { key: keyof OperatorRow; added: keyof OperatorRow }[];

export type OperatorMetricKey = (typeof OPERATOR_METRICS)[number]["key"];

const BAND_ORDER = [
  "GSM900",
  "GSM1800",
  "UMTS900",
  "UMTS2100",
  "LTE700",
  "LTE800",
  "LTE900",
  "LTE1800",
  "LTE2100",
  "LTE2600",
  "NR700",
  "NR900",
  "NR1800",
  "NR2100",
  "NR2600",
  "NR3500",
  "GSM-R900",
  "IOT900",
  "CDMA420",
  "LTE420",
  "LTE450",
];
const BAND_ORDER_INDEX = new Map(BAND_ORDER.map((band, index) => [band, index]));

function percentFractionDigits(value: number): number {
  if (value < 0.1) return 3;
  if (value < 1) return 2;
  return 1;
}

export function createFormatters(language: Language): Formatters {
  const locale = LOCALES[language];
  const numberFormat = new Intl.NumberFormat(locale);
  return {
    number: (value) => numberFormat.format(value),
    percent: (value) => `${value.toLocaleString(locale, { maximumFractionDigits: percentFractionDigits(value) })}%`,
  };
}

export function localizedMonth(month: string, language: Language): { month: string; year: string } {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return { month: date.toLocaleDateString(LOCALES[language], { month: "long", timeZone: "UTC" }), year: String(date.getUTCFullYear()) };
}

export function previousMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export function compareOperators(a: StatsOperator, b: StatsOperator): number {
  return (
    getOperatorSortIndex(resolveOperatorMnc(a.mnc, a.name)) - getOperatorSortIndex(resolveOperatorMnc(b.mnc, b.name)) || a.name.localeCompare(b.name)
  );
}

function bandOrderKey(name: string): string {
  return name.replace(/\s*\((?:FDD|TDD)\)$/, "").replace(/\s+/g, "");
}

export function compareBandNames(a: string, b: string): number {
  const orderA = BAND_ORDER_INDEX.get(bandOrderKey(a)) ?? Number.MAX_SAFE_INTEGER;
  const orderB = BAND_ORDER_INDEX.get(bandOrderKey(b)) ?? Number.MAX_SAFE_INTEGER;
  return orderA - orderB || a.localeCompare(b, undefined, { numeric: true });
}

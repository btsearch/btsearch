import { BAND_RATS } from "@openbts/shared/contract/constants";

import { UNKNOWN_BAND_LABEL } from "./data/mapFilters";
import type { MapLookups } from "./data/mapLookups";
import { foldSearchText } from "./searchAutocomplete";
import type { FilterKeyword } from "./types";
import type { BrandLook } from "@/components/cellular/brandMark";
import { getCountryName } from "@/lib/geo/countryName";

export type ValueOption = {
  value: string;
  label: string;
  code: string | null;
  tags: readonly string[];
  brand?: BrandLook | null;
  countryCode?: string;
  group?: string;
};

type Translate = (key: string) => string;

const DAY_MS = 86_400_000;
const DATE_PRESETS = [
  { labelKey: "autocomplete.presets.today", daysBack: 0 },
  { labelKey: "autocomplete.presets.lastWeek", daysBack: 7 },
  { labelKey: "autocomplete.presets.lastMonth", daysBack: 30 },
] as const;

export function formatSearchDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function listDatePresets(t: Translate, today: Date): ValueOption[] {
  const presets: ValueOption[] = DATE_PRESETS.map(({ labelKey, daysBack }) => {
    const value = formatSearchDate(new Date(today.getTime() - daysBack * DAY_MS));
    return { value, label: t(`main:${labelKey}`), code: value, tags: [] };
  });
  const yearStart = formatSearchDate(new Date(today.getFullYear(), 0, 1));
  presets.push({ value: yearStart, label: t("main:autocomplete.presets.thisYear"), code: yearStart, tags: [] });
  return presets;
}

function listOperatorValues(lookups: MapLookups): ValueOption[] {
  const options: ValueOption[] = [];
  for (const group of lookups.operatorGroups.values()) {
    for (const { operator, brand } of [...group.main, ...group.minor]) {
      if (operator.primaryPlmn === null) continue;
      options.push({ value: operator.primaryPlmn, label: operator.name, code: operator.primaryPlmn, tags: [], brand, group: operator.countryCode });
    }
  }
  return options;
}

function listBandValues(lookups: MapLookups): ValueOption[] {
  const ratsByLabel = new Map<number, Set<string>>();
  for (const band of lookups.bands) {
    if (band.labelMhz === null || band.labelMhz === UNKNOWN_BAND_LABEL) continue;
    const rats = ratsByLabel.get(band.labelMhz) ?? new Set<string>();
    rats.add(band.rat);
    ratsByLabel.set(band.labelMhz, rats);
  }

  return [...ratsByLabel]
    .sort(([left], [right]) => left - right)
    .map(([labelMhz, rats]) => ({
      value: String(labelMhz),
      label: `${labelMhz} MHz`,
      code: null,
      tags: BAND_RATS.filter((rat) => rats.has(rat)).map((rat) => rat.toUpperCase()),
    }));
}

export function listValueOptions(
  keyword: FilterKeyword,
  lookups: MapLookups | undefined,
  t: Translate,
  language: string,
  today: Date,
): ValueOption[] {
  switch (keyword.valueKind) {
    case "choice":
      return (keyword.choices ?? []).map((choice) => ({
        value: choice.value,
        label: choice.labelKey === undefined ? choice.value : t(choice.labelKey),
        code: choice.labelKey === undefined ? null : choice.value,
        tags: choice.tag === undefined ? [] : [choice.tag],
      }));
    case "boolean":
      return [
        { value: "true", label: t("common:labels.yes"), code: "true", tags: [] },
        { value: "false", label: t("common:labels.no"), code: "false", tags: [] },
      ];
    case "operator":
      return lookups === undefined ? [] : listOperatorValues(lookups);
    case "country":
      return (lookups?.countries ?? []).map((country) => ({
        value: country.code,
        label: getCountryName(country.code, language),
        code: null,
        tags: [],
        countryCode: country.code,
      }));
    case "region":
      return [...(lookups?.regions ?? [])]
        .sort((left, right) => left.countryCode.localeCompare(right.countryCode))
        .map((region) => ({ value: region.code, label: region.name, code: region.code, tags: [], group: region.countryCode }));
    case "band":
      return lookups === undefined ? [] : listBandValues(lookups);
    case "date":
      return listDatePresets(t, today);
    case "gps":
    case "number":
    case "text":
      return [];
  }
}

export function filterValueOptions(options: readonly ValueOption[], typed: string): ValueOption[] {
  const wanted = foldSearchText(typed.trim());
  if (wanted === "") return [...options];
  return options.filter((option) => foldSearchText(option.label).includes(wanted) || foldSearchText(option.value).includes(wanted));
}

export function acceptsTypedValue(keyword: FilterKeyword): boolean {
  return keyword.valueKind === "gps" || keyword.valueKind === "number" || keyword.valueKind === "text" || keyword.valueKind === "date";
}

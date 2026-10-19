import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useMapLookups } from "../../data/mapLookups";
import { filterValueOptions, listValueOptions } from "../../searchValues";
import type { SearchAssist } from "../../types";
import { type AssistSearchOption, buildAssistOptions } from "./searchOptions";

const NO_OPTIONS: AssistSearchOption[] = [];
const LOOKUP_VALUE_KINDS: ReadonlySet<string> = new Set(["operator", "country", "region", "band"]);

export function useSearchAssistOptions(assist: SearchAssist | null, keywordLimit?: number) {
  const { t, i18n } = useTranslation(["main", "common", "stations"]);
  const { lookups } = useMapLookups();
  const [today] = useState(() => new Date());
  const keyword = assist?.view === "values" ? assist.keyword : undefined;
  const typed = assist?.view === "values" ? assist.typed : "";

  const allValues = useMemo(
    () => (keyword === undefined ? [] : listValueOptions(keyword, lookups, t, i18n.language, today)),
    [i18n.language, keyword, lookups, t, today],
  );
  const valueOptions = useMemo(() => filterValueOptions(allValues, typed), [allValues, typed]);
  const options = useMemo(
    () => (assist === null ? NO_OPTIONS : buildAssistOptions(assist, valueOptions, keywordLimit)),
    [assist, keywordLimit, valueOptions],
  );

  return {
    options,
    areValuesLoading: keyword !== undefined && lookups === undefined && LOOKUP_VALUE_KINDS.has(keyword.valueKind),
  };
}

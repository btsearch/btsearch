import { type ChangeEvent, type FocusEvent, type KeyboardEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AssistSearchOption } from "../components/search-overlay/searchOptions";
import { FREQUENT_FILTER_KEYS, FREQUENT_FILTER_LIMIT } from "../constants";
import { forgetRecentSearch, loadRecentSearches, rememberRecentSearch } from "../recentSearches";
import {
  type SearchContext,
  buildFilter,
  findFilterKeyword,
  findInvalidFilterValue,
  findQueryProblem,
  getSearchContext,
  isSingleValueKeyword,
  matchFilterKeywords,
  replaceLastSearchToken,
  replaceSearchKeyword,
  splitFilterValues,
} from "../searchAutocomplete";
import type { FilterKeyword, ParsedFilter, SearchAssist } from "../types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type OverlayType = "assist" | "results" | null;

type ValuePicker = {
  key: string;
  chipIndex: number | null;
  savedInput: string;
};

type SearchState = {
  inputValue: string;
  parsedFilters: ParsedFilter[];
  activeOverlay: OverlayType;
  focusedChipIndex: number | null;
  picker: ValuePicker | null;
  showAllFilters: boolean;
};

type UseSearchStateArgs = {
  filterKeywords: FilterKeyword[];
  parseFilters: (query: string) => {
    filters: ParsedFilter[];
    remainingText: string;
  };
  recentScope: string;
  initialValue?: string;
  externalQuery?: string;
  onQueryChange?: (query: string) => void;
  resultsEnabled?: boolean;
};

const REMEMBERED_TEXT_MIN_LENGTH = 3;

function computeOverlay(input: string, context: SearchContext, resultsEnabled: boolean): OverlayType {
  if (context.kind === "empty" || context.kind === "value") return "assist";
  if (context.kind === "word") return resultsEnabled ? "results" : "assist";
  if (resultsEnabled && input.trim() !== "") return "results";
  return null;
}

function hasUnclosedQuote(input: string): boolean {
  return /\w+:\s*"[^"]*$/.test(input) || /\w+:\s*'[^']*$/.test(input);
}

function getUrlHashQueryParam(key: string): string | null {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash.startsWith("map=")) return null;

  const [, queryPart = ""] = hash.split("?");
  const params = new URLSearchParams(queryPart);
  return params.get(key);
}

function buildSearchQuery(filters: ParsedFilter[], text: string): string {
  return [...filters.map((filter) => filter.raw), text.trim()].filter(Boolean).join(" ");
}

function changeFilterValues(values: readonly string[], value: string, mode: "toggle" | "add"): string[] {
  const wanted = value.toLowerCase();
  const kept = values.filter((entry) => entry.toLowerCase() !== wanted);
  if (kept.length === values.length) return [...values, value];
  return mode === "toggle" ? kept : [...values];
}

function freshSearchState(parsedFilters: ParsedFilter[], inputValue: string, activeOverlay: OverlayType): SearchState {
  return { inputValue, parsedFilters, activeOverlay, focusedChipIndex: null, picker: null, showAllFilters: false };
}

function withoutPicker(state: SearchState): SearchState {
  return state.picker ? { ...state, inputValue: state.picker.savedInput, picker: null } : state;
}

function withoutUnfinishedValue(input: string, keywords: readonly FilterKeyword[]): string {
  const context = getSearchContext(input, keywords);
  return context.kind === "value" ? input.slice(0, context.tokenStart) : input;
}

function isWorthRemembering(filters: ParsedFilter[], text: string): boolean {
  return filters.length > 0 || text.trim().length >= REMEMBERED_TEXT_MIN_LENGTH;
}

export function useSearchState({
  filterKeywords,
  parseFilters,
  recentScope,
  initialValue,
  externalQuery,
  onQueryChange,
  resultsEnabled = true,
}: UseSearchStateArgs) {
  const { t } = useTranslation("main");
  const [searchState, setSearchState] = useState<SearchState>(() => {
    const urlQuery = getUrlHashQueryParam("q");
    const query = externalQuery ?? urlQuery ?? initialValue ?? "";
    const { filters, remainingText } = query ? parseFilters(query) : { filters: [], remainingText: "" };
    const opensFromUrl = externalQuery === undefined && urlQuery;
    return freshSearchState(
      filters,
      remainingText,
      opensFromUrl ? computeOverlay(remainingText, getSearchContext(remainingText, filterKeywords), resultsEnabled) : null,
    );
  });
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => loadRecentSearches(recentScope));
  const [previousExternalQuery, setPreviousExternalQuery] = useState(externalQuery);

  if (externalQuery !== previousExternalQuery) {
    setPreviousExternalQuery(externalQuery);
    setSearchState((current) => {
      const currentText = current.picker ? current.picker.savedInput : withoutUnfinishedValue(current.inputValue, filterKeywords);
      if (externalQuery === undefined || buildSearchQuery(current.parsedFilters, currentText) === externalQuery) return current;

      const { filters, remainingText } = externalQuery ? parseFilters(externalQuery) : { filters: [], remainingText: "" };
      return freshSearchState(filters, remainingText, null);
    });
  }

  const { inputValue, parsedFilters, activeOverlay, focusedChipIndex, picker, showAllFilters } = searchState;

  const containerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const context = useMemo(() => getSearchContext(inputValue, filterKeywords), [inputValue, filterKeywords]);
  const finishedInput = context.kind === "value" ? inputValue.slice(0, context.tokenStart) : inputValue;
  const queryText = picker ? picker.savedInput : finishedInput;
  const query = useMemo(() => buildSearchQuery(parsedFilters, queryText), [parsedFilters, queryText]);

  const debouncedQuery = useDebouncedValue(query, 500);
  const debouncedInput = useDebouncedValue(queryText.trim(), 500);

  const statsSearchMode = !resultsEnabled || debouncedInput === "" ? "bounds" : "search";

  const assist = useMemo((): SearchAssist | null => {
    if (picker) {
      const keyword = findFilterKeyword(picker.key, filterKeywords);
      if (keyword === undefined) return null;
      const chip = picker.chipIndex === null ? undefined : parsedFilters[picker.chipIndex];
      return { view: "values", keyword, selected: chip ? splitFilterValues(chip.value) : [], typed: inputValue, editing: chip !== undefined };
    }

    switch (context.kind) {
      case "empty":
        if (showAllFilters) return { view: "all", keywords: filterKeywords };
        return {
          view: "home",
          keywords: FREQUENT_FILTER_KEYS.flatMap((key) => filterKeywords.filter((keyword) => keyword.key === key)).slice(0, FREQUENT_FILTER_LIMIT),
          recents: recentSearches,
        };
      case "value":
        return { view: "values", keyword: context.keyword, selected: context.committed, typed: context.typed, editing: false };
      case "word":
        return {
          view: "keywords",
          keywords: matchFilterKeywords(context.word, filterKeywords, (keyword) => t(`autocomplete.filters.${keyword.descriptionKey}`)),
        };
      case "text":
        return null;
    }
  }, [context, filterKeywords, inputValue, parsedFilters, picker, recentSearches, showAllFilters, t]);

  const invalidChipIndexes = useMemo(
    () => new Set(parsedFilters.flatMap((filter, index) => (findInvalidFilterValue(filter, filterKeywords) === null ? [] : [index]))),
    [filterKeywords, parsedFilters],
  );
  const queryProblem = useMemo(() => findQueryProblem(query, filterKeywords), [filterKeywords, query]);

  function publishQuery(nextFilters: ParsedFilter[], nextText: string) {
    const nextQuery = buildSearchQuery(nextFilters, nextText);
    if (nextQuery !== externalQuery) onQueryChange?.(nextQuery);
  }

  function overlayFor(input: string, withResults = resultsEnabled): OverlayType {
    return computeOverlay(input, getSearchContext(input, filterKeywords), withResults);
  }

  function rememberQuery() {
    if (isWorthRemembering(parsedFilters, queryText)) setRecentSearches(rememberRecentSearch(recentScope, query));
  }

  function forgetRecent(recentQuery: string) {
    setRecentSearches(forgetRecentSearch(recentScope, recentQuery));
    inputRef.current?.focus();
  }

  function applyQuery(nextQuery: string) {
    const { filters, remainingText } = parseFilters(nextQuery);
    publishQuery(filters, withoutUnfinishedValue(remainingText, filterKeywords));
    setSearchState(freshSearchState(filters, remainingText, overlayFor(remainingText)));
    inputRef.current?.focus();
  }

  function fixQueryProblem() {
    if (queryProblem?.kind !== "unknownKeyword") return;
    applyQuery(replaceSearchKeyword(query, queryProblem.typed, queryProblem.suggestion));
  }

  function handleContainerBlur(e: FocusEvent, excludedFocusRegion: Node | null = null) {
    const relatedTarget = e.relatedTarget as Node | null;
    if (containerRef.current?.contains(relatedTarget) && !excludedFocusRegion?.contains(relatedTarget)) return;
    setIsFocused(false);
    rememberQuery();
    setSearchState((current) => ({ ...withoutPicker(current), activeOverlay: null, focusedChipIndex: null }));
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;

    if (picker) {
      setSearchState((current) => ({ ...current, inputValue: value }));
      return;
    }

    if ((value.endsWith(" ") && !hasUnclosedQuote(value)) || value === "") {
      const fullQuery = [...parsedFilters.map((f) => f.raw), value].filter(Boolean).join(" ");
      const { filters: detected, remainingText } = parseFilters(fullQuery);

      if (detected.length > parsedFilters.length) {
        publishQuery(detected, remainingText);
        setSearchState(freshSearchState(detected, remainingText, overlayFor(remainingText)));
        return;
      }
    }

    publishQuery(parsedFilters, withoutUnfinishedValue(value, filterKeywords));
    setSearchState((current) => ({
      ...current,
      inputValue: value,
      focusedChipIndex: null,
      showAllFilters: false,
      activeOverlay: overlayFor(value),
    }));
  }

  function applyAutocomplete(keyword: string) {
    const nextInput = replaceLastSearchToken(inputValue, keyword);
    publishQuery(parsedFilters, withoutUnfinishedValue(nextInput, filterKeywords));
    setSearchState((current) => ({ ...current, inputValue: nextInput, showAllFilters: false, activeOverlay: overlayFor(nextInput) }));
    inputRef.current?.focus();
  }

  function openAllFilters() {
    setSearchState((current) => ({ ...current, showAllFilters: true, activeOverlay: "assist" }));
    inputRef.current?.focus();
  }

  function applyValue(value: string, mode: "toggle" | "add") {
    if (assist?.view !== "values") return;
    const { keyword } = assist;
    const isSingle = isSingleValueKeyword(keyword);
    const values = isSingle ? [value] : changeFilterValues(assist.selected, value, mode);

    if (!picker) {
      if (values.length === 0) {
        setSearchState((current) => ({ ...current, inputValue: `${finishedInput}${keyword.key}` }));
        return;
      }

      const base = finishedInput.trimEnd();
      const nextFilters = [...parsedFilters, buildFilter(keyword, values)];
      publishQuery(nextFilters, base);
      setSearchState((current) => ({
        ...current,
        parsedFilters: nextFilters,
        inputValue: isSingle ? base : "",
        picker: isSingle ? null : { key: keyword.key.slice(0, -1), chipIndex: nextFilters.length - 1, savedInput: base },
        focusedChipIndex: null,
        activeOverlay: isSingle ? overlayFor(base) : "assist",
      }));
      inputRef.current?.focus();
      return;
    }

    let nextFilters: ParsedFilter[];
    let chipIndex = picker.chipIndex;
    if (values.length === 0) {
      nextFilters = parsedFilters.filter((_, index) => index !== picker.chipIndex);
      chipIndex = null;
    } else if (assist.editing) {
      nextFilters = parsedFilters.map((filter, index) => (index === picker.chipIndex ? buildFilter(keyword, values) : filter));
    } else {
      nextFilters = [...parsedFilters, buildFilter(keyword, values)];
      chipIndex = nextFilters.length - 1;
    }

    publishQuery(nextFilters, picker.savedInput);
    if (isSingle) {
      setSearchState((current) => ({ ...withoutPicker(current), parsedFilters: nextFilters, activeOverlay: overlayFor(picker.savedInput) }));
    } else {
      setSearchState((current) => ({
        ...current,
        parsedFilters: nextFilters,
        inputValue: mode === "add" ? "" : current.inputValue,
        picker: { ...picker, chipIndex },
      }));
    }
    inputRef.current?.focus();
  }

  function openChipPicker(index: number) {
    const filter = parsedFilters[index];
    if (filter === undefined || findFilterKeyword(filter.key, filterKeywords) === undefined) return;
    setSearchState((current) => ({
      ...current,
      inputValue: "",
      picker: { key: filter.key, chipIndex: index, savedInput: current.picker ? current.picker.savedInput : current.inputValue },
      focusedChipIndex: null,
      showAllFilters: false,
      activeOverlay: "assist",
    }));
    inputRef.current?.focus();
  }

  function closePicker(focusChip: boolean) {
    if (!picker) return;
    setSearchState((current) => ({
      ...withoutPicker(current),
      focusedChipIndex: focusChip ? picker.chipIndex : null,
      activeOverlay: overlayFor(picker.savedInput),
    }));
    inputRef.current?.focus();
  }

  function goBack() {
    if (picker) {
      closePicker(false);
      return;
    }
    setSearchState((current) => ({ ...current, inputValue: finishedInput, showAllFilters: false, activeOverlay: overlayFor(finishedInput) }));
    inputRef.current?.focus();
  }

  function removePickedFilter() {
    if (!picker) return;
    const nextFilters = parsedFilters.filter((_, index) => index !== picker.chipIndex);
    publishQuery(nextFilters, picker.savedInput);
    setSearchState((current) => ({ ...withoutPicker(current), parsedFilters: nextFilters, activeOverlay: overlayFor(picker.savedInput) }));
    inputRef.current?.focus();
  }

  function selectAssistOption(option: AssistSearchOption) {
    switch (option.kind) {
      case "filter":
        applyAutocomplete(option.keyword.key);
        return;
      case "all-filters":
        openAllFilters();
        return;
      case "recent":
        applyQuery(option.query);
        return;
      case "value":
        applyValue(option.option.value, "toggle");
        return;
      case "typed-value":
        applyValue(option.value, "add");
        return;
      case "remove-filter":
        removePickedFilter();
        return;
    }
  }

  function clearSearch() {
    publishQuery([], "");
    setSearchState(freshSearchState([], "", null));
    inputRef.current?.focus();
  }

  function removeFilter(filter: ParsedFilter) {
    const nextFilters = parsedFilters.filter((item) => item !== filter);
    publishQuery(nextFilters, queryText);
    setSearchState((current) => ({ ...withoutPicker(current), parsedFilters: nextFilters, focusedChipIndex: null }));
    inputRef.current?.focus();
  }

  function removeChipAt(chipIndex: number) {
    const nextFilters = parsedFilters.filter((_, index) => index !== chipIndex);
    publishQuery(nextFilters, finishedInput);
    if (parsedFilters.length <= 1) {
      setSearchState((current) => ({ ...current, parsedFilters: nextFilters, focusedChipIndex: null }));
      inputRef.current?.focus();
    } else {
      setSearchState((current) => ({ ...current, parsedFilters: nextFilters, focusedChipIndex: Math.min(chipIndex, parsedFilters.length - 2) }));
    }
  }

  function unwrapChip(chipIndex: number) {
    const filter = parsedFilters[chipIndex];
    if (filter === undefined) return;
    const nextFilters = parsedFilters.filter((_, index) => index !== chipIndex);
    const nextInput = [inputValue.trimEnd(), `${filter.key}:${filter.value}`].filter(Boolean).join(" ");
    publishQuery(nextFilters, withoutUnfinishedValue(nextInput, filterKeywords));
    setSearchState((current) => ({
      ...current,
      parsedFilters: nextFilters,
      inputValue: nextInput,
      focusedChipIndex: null,
      activeOverlay: overlayFor(nextInput),
    }));
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (picker) {
      if (e.key === "Escape" || (e.key === "Backspace" && inputValue === "")) {
        e.preventDefault();
        closePicker(picker.chipIndex !== null);
      } else if (e.key === " " && inputValue === "") {
        e.preventDefault();
        closePicker(false);
      }
      return;
    }

    if (focusedChipIndex !== null) {
      if (e.key === "Enter") {
        e.preventDefault();
        openChipPicker(focusedChipIndex);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        unwrapChip(focusedChipIndex);
      } else if (e.key === "Delete") {
        e.preventDefault();
        removeChipAt(focusedChipIndex);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSearchState((current) => ({ ...current, focusedChipIndex: Math.max(0, focusedChipIndex - 1) }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (focusedChipIndex < parsedFilters.length - 1) {
          setSearchState((current) => ({ ...current, focusedChipIndex: focusedChipIndex + 1 }));
        } else {
          setSearchState((current) => ({ ...current, focusedChipIndex: null }));
          inputRef.current?.focus();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSearchState((current) => ({ ...current, focusedChipIndex: null }));
        inputRef.current?.focus();
      }
      return;
    }

    if (e.key === "Escape" && context.kind === "value") {
      e.preventDefault();
      goBack();
      return;
    }

    const caretAtStart = inputRef.current?.selectionStart === 0 && inputRef.current?.selectionEnd === 0;
    if (caretAtStart && inputValue === "" && parsedFilters.length > 0 && (e.key === "Backspace" || e.key === "ArrowLeft")) {
      e.preventDefault();
      setSearchState((current) => ({ ...current, focusedChipIndex: parsedFilters.length - 1 }));
    }
  }

  function handleInputFocus() {
    setIsFocused(true);
    setSearchState((current) => ({ ...current, focusedChipIndex: null }));
    openOverlay();
  }

  function handleInputClick() {
    if (activeOverlay !== "assist") openOverlay();
  }

  function openOverlay(nextResultsEnabled = resultsEnabled) {
    setSearchState((current) => ({
      ...current,
      activeOverlay: current.picker ? "assist" : overlayFor(current.inputValue, nextResultsEnabled),
    }));
  }

  function closeOverlay() {
    setSearchState((current) => ({ ...withoutPicker(current), activeOverlay: null }));
  }

  return {
    query,
    statsSearchMode,
    assist,
    isPickerOpen: picker !== null,
    invalidChipIndexes,
    queryProblem,

    inputValue,
    debouncedQuery,
    debouncedInput,
    isFocused,
    parsedFilters,
    activeOverlay,

    containerRef,
    inputRef,

    focusedChipIndex,

    handleContainerBlur,
    handleInputChange,
    handleInputFocus,
    handleInputClick,
    openOverlay,
    handleKeyDown,
    selectAssistOption,
    openChipPicker,
    goBack,
    forgetRecent,
    rememberQuery,
    fixQueryProblem,
    clearSearch,
    removeFilter,
    closeOverlay,
  };
}

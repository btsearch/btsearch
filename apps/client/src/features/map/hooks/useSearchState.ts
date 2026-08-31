import { type ChangeEvent, type FocusEvent, type KeyboardEvent, useMemo, useRef, useState } from "react";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { getAutocompleteMatches, replaceLastSearchToken } from "../searchAutocomplete";
import type { FilterKeyword, ParsedFilter } from "../types";

type OverlayType = "autocomplete" | "results" | null;

type SearchState = {
  inputValue: string;
  parsedFilters: ParsedFilter[];
  activeOverlay: OverlayType;
  focusedChipIndex: number | null;
};

type UseSearchStateArgs = {
  filterKeywords: FilterKeyword[];
  parseFilters: (query: string) => {
    filters: ParsedFilter[];
    remainingText: string;
  };
  initialValue?: string;
  externalQuery?: string;
  onQueryChange?: (query: string) => void;
  resultsEnabled?: boolean;
};

function computeOverlay(input: string, hasMatches: boolean, resultsEnabled: boolean): OverlayType {
  if (input === "") return "autocomplete";
  if (hasMatches) return "autocomplete";
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

function buildSearchQuery(filters: ParsedFilter[], inputValue: string): string {
  return [...filters.map((filter) => filter.raw), inputValue.trim()].filter(Boolean).join(" ");
}

export function useSearchState({
  filterKeywords,
  parseFilters,
  initialValue,
  externalQuery,
  onQueryChange,
  resultsEnabled = true,
}: UseSearchStateArgs) {
  const [searchState, setSearchState] = useState<SearchState>(() => {
    const urlQuery = getUrlHashQueryParam("q");
    const query = externalQuery ?? urlQuery ?? initialValue ?? "";
    const { filters, remainingText } = query ? parseFilters(query) : { filters: [], remainingText: "" };
    return {
      inputValue: remainingText,
      parsedFilters: filters,
      focusedChipIndex: null,
      activeOverlay:
        externalQuery === undefined && urlQuery
          ? computeOverlay(remainingText, getAutocompleteMatches(remainingText, filterKeywords).length > 0, resultsEnabled)
          : null,
    };
  });
  const [isFocused, setIsFocused] = useState(false);
  const [previousExternalQuery, setPreviousExternalQuery] = useState(externalQuery);

  if (externalQuery !== previousExternalQuery) {
    setPreviousExternalQuery(externalQuery);
    setSearchState((current) => {
      if (externalQuery === undefined || buildSearchQuery(current.parsedFilters, current.inputValue) === externalQuery) return current;

      const { filters, remainingText } = externalQuery ? parseFilters(externalQuery) : { filters: [], remainingText: "" };
      return {
        ...current,
        inputValue: remainingText,
        parsedFilters: filters,
        focusedChipIndex: null,
        activeOverlay: null,
      };
    });
  }

  const { inputValue, parsedFilters, activeOverlay, focusedChipIndex } = searchState;

  const containerRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => buildSearchQuery(parsedFilters, inputValue), [parsedFilters, inputValue]);

  const debouncedQuery = useDebouncedValue(query, 500);
  const debouncedInput = useDebouncedValue(inputValue.trim(), 500);

  const statsSearchMode = !resultsEnabled || debouncedInput === "" ? "bounds" : "search";

  const autocompleteOptions = useMemo(() => getAutocompleteMatches(inputValue, filterKeywords), [inputValue, filterKeywords]);

  function publishQuery(nextFilters: ParsedFilter[], nextInputValue: string) {
    const nextQuery = buildSearchQuery(nextFilters, nextInputValue);
    if (nextQuery !== externalQuery) onQueryChange?.(nextQuery);
  }

  function handleContainerBlur(e: FocusEvent) {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!containerRef.current?.contains(relatedTarget)) {
      setIsFocused(false);
      setSearchState((current) => ({ ...current, activeOverlay: null }));
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;

    if ((value.endsWith(" ") && !hasUnclosedQuote(value)) || value === "") {
      const fullQuery = [...parsedFilters.map((f) => f.raw), value].filter(Boolean).join(" ");
      const { filters: detected, remainingText } = parseFilters(fullQuery);

      if (detected.length > parsedFilters.length) {
        publishQuery(detected, remainingText);
        setSearchState({
          inputValue: remainingText,
          parsedFilters: detected,
          focusedChipIndex: null,
          activeOverlay: resultsEnabled ? "results" : null,
        });
        return;
      }
    }

    const matches = getAutocompleteMatches(value, filterKeywords);
    publishQuery(parsedFilters, value);
    setSearchState((current) => ({
      ...current,
      inputValue: value,
      focusedChipIndex: null,
      activeOverlay: computeOverlay(value, matches.length > 0, resultsEnabled),
    }));
  }

  function applyAutocomplete(keyword: string) {
    const nextInput = replaceLastSearchToken(inputValue, keyword);
    publishQuery(parsedFilters, nextInput);
    setSearchState((current) => ({
      ...current,
      inputValue: nextInput,
      activeOverlay: computeOverlay(nextInput, getAutocompleteMatches(nextInput, filterKeywords).length > 0, resultsEnabled),
    }));
    inputRef.current?.focus();
  }

  function clearSearch() {
    publishQuery([], "");
    setSearchState({ inputValue: "", parsedFilters: [], activeOverlay: null, focusedChipIndex: null });
    inputRef.current?.focus();
  }

  function removeFilter(filter: ParsedFilter) {
    const nextFilters = parsedFilters.filter((item) => item !== filter);
    publishQuery(nextFilters, inputValue);
    setSearchState((current) => ({ ...current, parsedFilters: nextFilters }));
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const currentInput = inputValue;
    const filters = parsedFilters;
    const chipIdx = focusedChipIndex;
    const caretAtStart = inputRef.current?.selectionStart === 0 && inputRef.current?.selectionEnd === 0;

    if (chipIdx !== null) {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const nextFilters = filters.filter((_, index) => index !== chipIdx);
        publishQuery(nextFilters, currentInput);
        if (filters.length <= 1) {
          setSearchState((current) => ({ ...current, parsedFilters: nextFilters, focusedChipIndex: null }));
          inputRef.current?.focus();
        } else {
          setSearchState((current) => ({ ...current, parsedFilters: nextFilters, focusedChipIndex: Math.min(chipIdx, filters.length - 2) }));
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSearchState((current) => ({ ...current, focusedChipIndex: Math.max(0, chipIdx - 1) }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (chipIdx < filters.length - 1) {
          setSearchState((current) => ({ ...current, focusedChipIndex: chipIdx + 1 }));
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

    if (caretAtStart && currentInput === "" && filters.length > 0 && (e.key === "Backspace" || e.key === "ArrowLeft")) {
      e.preventDefault();
      setSearchState((current) => ({ ...current, focusedChipIndex: filters.length - 1 }));
    }
  }

  function handleInputFocus() {
    setIsFocused(true);
    setSearchState((current) => ({ ...current, focusedChipIndex: null }));
    openOverlay();
  }

  function handleInputClick() {
    if (activeOverlay !== "autocomplete") openOverlay();
  }

  function openOverlay(nextResultsEnabled = resultsEnabled, hasMatches = autocompleteOptions.length > 0) {
    setSearchState((current) => ({ ...current, activeOverlay: computeOverlay(inputValue, hasMatches, nextResultsEnabled) }));
  }

  function closeOverlay() {
    setSearchState((current) => ({ ...current, activeOverlay: null }));
  }

  return {
    query,
    statsSearchMode,
    autocompleteOptions,

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
    applyAutocomplete,
    clearSearch,
    removeFilter,
    closeOverlay,
  };
}

import { type ChangeEvent, type FocusEvent, type KeyboardEvent, useMemo, useRef, useState } from "react";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { getAutocompleteMatches, replaceLastSearchToken } from "../searchAutocomplete";
import type { FilterKeyword, ParsedFilter } from "../types";

type OverlayType = "autocomplete" | "results" | null;

type UseSearchStateArgs = {
  filterKeywords: FilterKeyword[];
  parseFilters: (query: string) => {
    filters: ParsedFilter[];
    remainingText: string;
  };
  initialValue?: string;
  affectMap?: boolean;
};

function computeOverlay(input: string, hasMatches: boolean, affectMap: boolean): OverlayType {
  if (input === "") return "autocomplete";
  if (hasMatches) return "autocomplete";
  if (!affectMap && input.trim() !== "") return "results";
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

export function useSearchState({ filterKeywords, parseFilters, initialValue, affectMap = false }: UseSearchStateArgs) {
  const [initialSearchState] = useState(() => {
    const urlQuery = getUrlHashQueryParam("q");
    const query = urlQuery || initialValue || "";
    const { filters, remainingText } = query ? parseFilters(query) : { filters: [], remainingText: "" };
    return {
      inputValue: remainingText,
      parsedFilters: filters,
      activeOverlay: urlQuery ? computeOverlay(remainingText, getAutocompleteMatches(remainingText, filterKeywords).length > 0, affectMap) : null,
    };
  });
  const [inputValue, setInputValue] = useState(initialSearchState.inputValue);
  const [parsedFilters, setParsedFilters] = useState<ParsedFilter[]>(initialSearchState.parsedFilters);
  const [isFocused, setIsFocused] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(initialSearchState.activeOverlay);
  const [focusedChipIndex, setFocusedChipIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => [...parsedFilters.map((f) => f.raw), inputValue.trim()].filter(Boolean).join(" "), [parsedFilters, inputValue]);

  const debouncedQuery = useDebouncedValue(query, 500);
  const debouncedInput = useDebouncedValue(inputValue.trim(), 500);

  const searchMode = affectMap || debouncedInput === "" ? "bounds" : "search";

  const autocompleteOptions = useMemo(() => getAutocompleteMatches(inputValue, filterKeywords), [inputValue, filterKeywords]);

  function handleContainerBlur(e: FocusEvent) {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!containerRef.current?.contains(relatedTarget)) {
      setIsFocused(false);
      setActiveOverlay(null);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInputValue(value);
    setFocusedChipIndex(null);

    if ((value.endsWith(" ") && !hasUnclosedQuote(value)) || value === "") {
      const fullQuery = [...parsedFilters.map((f) => f.raw), value].filter(Boolean).join(" ");
      const { filters: detected, remainingText } = parseFilters(fullQuery);

      if (detected.length > parsedFilters.length) {
        setParsedFilters(detected);
        setInputValue(remainingText);
        setActiveOverlay("results");
        return;
      }
    }

    const matches = getAutocompleteMatches(value, filterKeywords);
    setActiveOverlay(computeOverlay(value, matches.length > 0, affectMap));
  }

  function applyAutocomplete(keyword: string) {
    setInputValue(replaceLastSearchToken(inputValue, keyword));
    setActiveOverlay("results");
    inputRef.current?.focus();
  }

  function clearSearch() {
    setInputValue("");
    setParsedFilters([]);
    setActiveOverlay(null);
    inputRef.current?.focus();
  }

  function removeFilter(filter: ParsedFilter) {
    setParsedFilters((prev) => prev.filter((f) => f !== filter));
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
        setParsedFilters((prev) => prev.filter((_, i) => i !== chipIdx));
        if (filters.length <= 1) {
          setFocusedChipIndex(null);
          inputRef.current?.focus();
        } else {
          setFocusedChipIndex(Math.min(chipIdx, filters.length - 2));
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedChipIndex(Math.max(0, chipIdx - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (chipIdx < filters.length - 1) {
          setFocusedChipIndex(chipIdx + 1);
        } else {
          setFocusedChipIndex(null);
          inputRef.current?.focus();
        }
      } else if (e.key === "Escape") {
        setFocusedChipIndex(null);
        inputRef.current?.focus();
      }
      return;
    }

    if (caretAtStart && currentInput === "" && filters.length > 0 && (e.key === "Backspace" || e.key === "ArrowLeft")) {
      e.preventDefault();
      setFocusedChipIndex(filters.length - 1);
    }
  }

  function handleInputFocus() {
    setIsFocused(true);
    setFocusedChipIndex(null);
    if (inputValue === "" && parsedFilters.length === 0) setActiveOverlay("autocomplete");
    else if (query.trim() !== "") setActiveOverlay("results");
  }

  function handleInputClick() {
    if (query.trim() !== "" && activeOverlay !== "autocomplete") setActiveOverlay("results");
  }

  function closeOverlay() {
    setActiveOverlay(null);
  }

  return {
    query,
    searchMode,
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
    handleKeyDown,
    applyAutocomplete,
    clearSearch,
    removeFilter,
    closeOverlay,
  };
}

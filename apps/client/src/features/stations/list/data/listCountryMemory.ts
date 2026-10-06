import { useSyncExternalStore } from "react";

import { hasSameMembers, sortUniqueCountryCodes } from "./listUrlValues";
import { isCountryCode } from "@/lib/apiValues";

type MemoryListener = () => void;

const STORAGE_KEY = "lists:countries:v1";
const NOTHING_PICKED: readonly string[] = [];

const memoryListeners = new Set<MemoryListener>();
let rememberedCountryCodes: readonly string[] | undefined;

function readStoredCountryCodes(): readonly string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    return Array.isArray(stored) ? sortUniqueCountryCodes(stored.filter(isCountryCode)) : NOTHING_PICKED;
  } catch {
    return NOTHING_PICKED;
  }
}

function storeCountryCodes(countryCodes: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(countryCodes));
  } catch {
    return;
  }
}

function subscribeToMemory(listener: MemoryListener): () => void {
  memoryListeners.add(listener);
  return () => memoryListeners.delete(listener);
}

export function getRememberedListCountries(): readonly string[] {
  rememberedCountryCodes ??= readStoredCountryCodes();
  return rememberedCountryCodes;
}

export function rememberListCountries(countryCodes: readonly string[]): void {
  const nextCountryCodes = sortUniqueCountryCodes(countryCodes.filter(isCountryCode));
  if (hasSameMembers(getRememberedListCountries(), nextCountryCodes)) return;

  rememberedCountryCodes = nextCountryCodes;
  storeCountryCodes(nextCountryCodes);
  for (const listener of memoryListeners) listener();
}

export function useRememberedListCountries(): readonly string[] {
  return useSyncExternalStore(subscribeToMemory, getRememberedListCountries);
}

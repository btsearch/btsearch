import { useSyncExternalStore } from "react";

type MemoryListener = () => void;

const STORAGE_KEY = "lists:filterPanel:v1";
const HIDDEN_WORD = "hidden";
const SHOWN_WORD = "shown";

const memoryListeners = new Set<MemoryListener>();
let isPanelKeptHidden: boolean | undefined;

function readStoredPanelChoice(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === HIDDEN_WORD;
  } catch {
    return false;
  }
}

function storePanelChoice(isHidden: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, isHidden ? HIDDEN_WORD : SHOWN_WORD);
  } catch {
    return;
  }
}

function subscribeToMemory(listener: MemoryListener): () => void {
  memoryListeners.add(listener);
  return () => memoryListeners.delete(listener);
}

function getIsListPanelKeptHidden(): boolean {
  isPanelKeptHidden ??= readStoredPanelChoice();
  return isPanelKeptHidden;
}

export function rememberListPanelHidden(isHidden: boolean): void {
  if (getIsListPanelKeptHidden() === isHidden) return;

  isPanelKeptHidden = isHidden;
  storePanelChoice(isHidden);
  for (const listener of memoryListeners) listener();
}

export function useIsListPanelKeptHidden(): boolean {
  return useSyncExternalStore(subscribeToMemory, getIsListPanelKeptHidden);
}

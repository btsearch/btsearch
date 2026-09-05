import type { ParsedRow } from "@/lib/analyzer/analyzer-parsers";
import type { AnalyzerResult } from "@/routes/_layout/analyzer";

const DEFAULT_PREFIX = "analyzer:draft:";
const DRAFT_TTL_MS = 60 * 60 * 1000;

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;
export type StoredParsedRow = DistributiveOmit<ParsedRow, "description" | "rawLine">;

export interface AnalyzerDraft {
  id: string;
  selectedRows: Array<{ index: number; parsedRow: StoredParsedRow; result: AnalyzerResult }>;
  metadata: {
    fileName: string | null;
    fileFormat: string | null;
  };
  parsedCount: number;
  createdAt: string;
}

const storageKey = (id: string) => `${DEFAULT_PREFIX}${id}`;
export const clearDraft = (id: string) => localStorage.removeItem(storageKey(id));

export function saveDraft(draft: Omit<AnalyzerDraft, "id" | "createdAt">): string {
  clearStaleDrafts();
  const id = crypto.randomUUID();
  const savedDraft: AnalyzerDraft = { ...draft, id, createdAt: new Date().toISOString() };
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(savedDraft));
  } catch {
    clearStaleDrafts(true);
    localStorage.setItem(storageKey(id), JSON.stringify(savedDraft));
  }

  return id;
}

export function loadDraft(id: string): AnalyzerDraft | null {
  try {
    const savedDraft = localStorage.getItem(storageKey(id));
    if (!savedDraft) return null;
    const draft = JSON.parse(savedDraft) as AnalyzerDraft;
    if (Date.now() - new Date(draft.createdAt).getTime() > DRAFT_TTL_MS) {
      clearDraft(id);
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

export function clearStaleDrafts(force = false) {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(DEFAULT_PREFIX)) continue;
    if (force) {
      toRemove.push(key);
      continue;
    }
    try {
      const { createdAt } = JSON.parse(localStorage.getItem(key)!) as { createdAt: string };
      if (Date.now() - new Date(createdAt).getTime() > DRAFT_TTL_MS) toRemove.push(key);
    } catch {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    localStorage.removeItem(key);
  }
}

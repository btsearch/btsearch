import { nanoid } from "nanoid";

import { type AnalyzerDraft, parseAnalyzerDraft } from "../model/draft";

export type LoadedDraft = { status: "ready"; draft: AnalyzerDraft } | { status: "missing" };

type NewDraft = Omit<AnalyzerDraft, "id" | "createdAt">;

const DRAFT_PREFIX = "analyzer:draft:";
const CURRENT_PREFIX = "analyzer:draft:v2:";
const STORAGE_VERSION = 2;
const DRAFT_LIFETIME_MS = 60 * 60 * 1000;
const DRAFT_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;
const MISSING_DRAFT: LoadedDraft = { status: "missing" };

function toStorageKey(id: string): string {
  return `${CURRENT_PREFIX}${id}`;
}

function removeStoredItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    return;
  }
}

function readStoredItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function listStoredDraftKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key !== null && key.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
  } catch {
    return [];
  }
  return keys;
}

function isExpired(draft: AnalyzerDraft): boolean {
  return Date.now() - Date.parse(draft.createdAt) > DRAFT_LIFETIME_MS;
}

function readStoredDraft(id: string): AnalyzerDraft | null {
  const serialized = readStoredItem(toStorageKey(id));
  if (serialized === null) return null;

  try {
    const envelope: unknown = JSON.parse(serialized);
    if (typeof envelope !== "object" || envelope === null || !("version" in envelope) || !("draft" in envelope)) return null;
    return envelope.version === STORAGE_VERSION ? parseAnalyzerDraft(envelope.draft, id) : null;
  } catch {
    return null;
  }
}

function removeStaleDrafts(shouldRemoveAll: boolean): void {
  for (const key of listStoredDraftKeys()) {
    const id = key.startsWith(CURRENT_PREFIX) ? key.slice(CURRENT_PREFIX.length) : null;
    const draft = shouldRemoveAll || id === null ? null : readStoredDraft(id);
    if (draft === null || isExpired(draft)) removeStoredItem(key);
  }
}

function writeDraft(draft: AnalyzerDraft): boolean {
  try {
    localStorage.setItem(toStorageKey(draft.id), JSON.stringify({ version: STORAGE_VERSION, draft }));
    return true;
  } catch {
    return false;
  }
}

export function saveAnalyzerDraft(draft: NewDraft): string | null {
  removeStaleDrafts(false);

  const savedDraft: AnalyzerDraft = { ...draft, id: nanoid(), createdAt: new Date().toISOString() };
  if (writeDraft(savedDraft)) return savedDraft.id;

  removeStaleDrafts(true);
  return writeDraft(savedDraft) ? savedDraft.id : null;
}

export function loadAnalyzerDraft(id: string | undefined): LoadedDraft {
  if (id === undefined || !DRAFT_ID_PATTERN.test(id)) return MISSING_DRAFT;

  const draft = readStoredDraft(id);
  if (draft !== null && !isExpired(draft)) return { status: "ready", draft };

  removeStoredItem(toStorageKey(id));
  return MISSING_DRAFT;
}

export function clearAnalyzerDraft(id: string): void {
  removeStoredItem(toStorageKey(id));
}

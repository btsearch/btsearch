const RECENT_SEARCH_LIMIT = 5;

function getStorageKey(scope: string): string {
  return `search:recent:${scope}`;
}

export function loadRecentSearches(scope: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(getStorageKey(scope)) ?? "[]");
    return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === "string").slice(0, RECENT_SEARCH_LIMIT) : [];
  } catch {
    return [];
  }
}

function storeRecentSearches(scope: string, queries: string[]): string[] {
  try {
    localStorage.setItem(getStorageKey(scope), JSON.stringify(queries));
  } catch {}
  return queries;
}

export function rememberRecentSearch(scope: string, query: string): string[] {
  const trimmed = query.trim();
  const current = loadRecentSearches(scope);
  if (trimmed === "" || current[0] === trimmed) return current;
  return storeRecentSearches(scope, [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(0, RECENT_SEARCH_LIMIT));
}

export function forgetRecentSearch(scope: string, query: string): string[] {
  return storeRecentSearches(
    scope,
    loadRecentSearches(scope).filter((entry) => entry !== query),
  );
}

import type { UserListSummary } from "./api";

export function sortLists(lists: UserListSummary[], favoriteUuids: string[]): UserListSummary[] {
  const favoriteRank = new Map(favoriteUuids.map((uuid, index) => [uuid, index]));
  return [...lists].sort((a, b) => {
    const aRank = favoriteRank.get(a.uuid) ?? Number.POSITIVE_INFINITY;
    const bRank = favoriteRank.get(b.uuid) ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

type DatedList = { updatedAt: string };

export function sortFavoriteListsFirst<T extends DatedList>(
  lists: readonly T[],
  favoriteIds: readonly string[],
  getListId: (list: T) => string,
): T[] {
  const favoriteRanks = new Map(favoriteIds.map((favoriteId, index) => [favoriteId, index]));
  return [...lists].sort((left, right) => {
    const leftRank = favoriteRanks.get(getListId(left)) ?? Number.POSITIVE_INFINITY;
    const rightRank = favoriteRanks.get(getListId(right)) ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

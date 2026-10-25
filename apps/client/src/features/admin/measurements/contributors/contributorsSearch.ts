import { MEASUREMENT_CONTRIBUTOR_SORTS, type MeasurementContributorListQuery } from "@openbts/shared/contract";

export type ContributorSort = MeasurementContributorListQuery["sort"];

export type ContributorsSearch = {
  sort?: Exclude<ContributorSort, "weight">;
};

const DEFAULT_CONTRIBUTOR_SORT = "weight" satisfies ContributorSort;

function parseSort(value: unknown): ContributorsSearch["sort"] {
  const sort = MEASUREMENT_CONTRIBUTOR_SORTS.find((candidate) => candidate === value);
  return sort === DEFAULT_CONTRIBUTOR_SORT ? undefined : sort;
}

export function parseContributorsSearch(search: Record<string, unknown>): ContributorsSearch {
  return { sort: parseSort(search.sort) };
}

export function readContributorSort(search: ContributorsSearch): ContributorSort {
  return search.sort ?? DEFAULT_CONTRIBUTOR_SORT;
}

export function toContributorsSearch(sort: ContributorSort): ContributorsSearch {
  return { sort: sort === DEFAULT_CONTRIBUTOR_SORT ? undefined : sort };
}

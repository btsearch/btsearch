export type Loadable<T> = { state: "loading" } | { state: "failed" } | { state: "ready"; value: T };

export const LOADING_VALUE: Loadable<never> = { state: "loading" };

const FAILED_VALUE: Loadable<never> = { state: "failed" };

export function toLoadable<T>(value: T | undefined, hasLoadFailed: boolean): Loadable<T> {
  if (value !== undefined) return { state: "ready", value };
  return hasLoadFailed ? FAILED_VALUE : LOADING_VALUE;
}

export type CountQueryState = { data: number | undefined; isError: boolean };

export function combineCountQueries(countQueries: readonly CountQueryState[]): Loadable<number>[] {
  return countQueries.map((countQuery) => toLoadable(countQuery.data, countQuery.isError));
}

export function getKnownCount(count: Loadable<number>): number {
  return count.state === "ready" ? count.value : 0;
}

export function isZeroCount(count: Loadable<number>): boolean {
  return count.state === "ready" && count.value === 0;
}

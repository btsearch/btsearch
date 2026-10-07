export type QueryLoadState = {
  data: unknown;
  isError: boolean;
  isFetching: boolean;
  errorUpdateCount: number;
};

export function hasFailedLoad(query: QueryLoadState): boolean {
  return query.data === undefined && (query.isError || (query.errorUpdateCount > 0 && query.isFetching));
}

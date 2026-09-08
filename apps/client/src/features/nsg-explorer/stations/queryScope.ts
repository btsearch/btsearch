const STATIONS_QUERY_SCOPE = "nsg-stations";

export type StationsQueryScope = {
  scope: typeof STATIONS_QUERY_SCOPE;
  identity: string;
};

export function createStationsQueryScope(correlationKey: string | null, operatorMncs: readonly number[]): StationsQueryScope {
  return {
    scope: STATIONS_QUERY_SCOPE,
    identity: `${correlationKey ?? ""}\0${[...operatorMncs].sort((left, right) => left - right).join(",")}`,
  };
}

export function isStationsQueryScope(value: unknown): value is StationsQueryScope {
  if (typeof value !== "object" || value === null) return false;
  if (!("scope" in value) || value.scope !== STATIONS_QUERY_SCOPE) return false;
  return "identity" in value && typeof value.identity === "string";
}

export function retainStationsPlaceholder<T>(
  previousData: T | undefined,
  previousQueryKey: readonly unknown[] | undefined,
  currentScope: StationsQueryScope,
): T | undefined {
  const previousScope = previousQueryKey?.at(-1);
  if (!isStationsQueryScope(previousScope) || previousScope.identity !== currentScope.identity) return undefined;
  return previousData;
}

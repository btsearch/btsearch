const NSG_STATIONS_QUERY_SCOPE = "nsg-stations";

export type NsgStationsQueryScope = {
  scope: typeof NSG_STATIONS_QUERY_SCOPE;
  identity: string;
};

export function createNsgStationsQueryScope(correlationKey: string | null, operatorMncs: readonly number[]): NsgStationsQueryScope {
  return {
    scope: NSG_STATIONS_QUERY_SCOPE,
    identity: `${correlationKey ?? ""}\0${[...operatorMncs].sort((left, right) => left - right).join(",")}`,
  };
}

export function isNsgStationsQueryScope(value: unknown): value is NsgStationsQueryScope {
  if (typeof value !== "object" || value === null) return false;
  if (!("scope" in value) || value.scope !== NSG_STATIONS_QUERY_SCOPE) return false;
  return "identity" in value && typeof value.identity === "string";
}

export function retainNsgStationsPlaceholder<T>(
  previousData: T | undefined,
  previousQueryKey: readonly unknown[] | undefined,
  currentScope: NsgStationsQueryScope,
): T | undefined {
  const previousScope = previousQueryKey?.at(-1);
  if (!isNsgStationsQueryScope(previousScope) || previousScope.identity !== currentScope.identity) return undefined;
  return previousData;
}

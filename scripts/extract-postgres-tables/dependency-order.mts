export type DependencyOrder = {
  tableKeys: string[];
  cyclicTableKeys: Set<string>;
};

export function orderTablesByDependencies(tableKeys: string[], dependencies: Map<string, Set<string>>): DependencyOrder {
  const selectedTableKeys = new Set(tableKeys);
  const states = new Map<string, "visiting" | "visited">();
  const orderedTableKeys: string[] = [];
  const cyclicTableKeys = new Set<string>();
  const activeStack: string[] = [];

  function visit(tableKey: string): void {
    const state = states.get(tableKey);
    if (state === "visited") return;
    if (state === "visiting") {
      const cycleStart = activeStack.indexOf(tableKey);
      for (const cyclicTableKey of activeStack.slice(cycleStart)) cyclicTableKeys.add(cyclicTableKey);
      return;
    }

    states.set(tableKey, "visiting");
    activeStack.push(tableKey);
    for (const dependency of dependencies.get(tableKey) ?? []) {
      if (!selectedTableKeys.has(dependency)) continue;
      if (states.get(dependency) === "visiting") {
        const cycleStart = activeStack.indexOf(dependency);
        for (const cyclicTableKey of activeStack.slice(cycleStart)) cyclicTableKeys.add(cyclicTableKey);
        continue;
      }

      visit(dependency);
    }
    activeStack.pop();
    states.set(tableKey, "visited");
    orderedTableKeys.push(tableKey);
  }

  for (const tableKey of tableKeys) visit(tableKey);

  return { tableKeys: orderedTableKeys, cyclicTableKeys };
}

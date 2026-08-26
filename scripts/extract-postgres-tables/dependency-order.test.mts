import assert from "node:assert/strict";
import test from "node:test";

import { orderTablesByDependencies } from "./dependency-order.mjs";

void test("orders parents before children while preserving independent source order", () => {
  const dependencies = new Map<string, Set<string>>([
    ["child", new Set(["parent"])],
    ["leaf", new Set(["child"])],
  ]);

  const result = orderTablesByDependencies(["independent", "leaf", "child", "parent"], dependencies);

  assert.deepEqual(result.tableKeys, ["independent", "parent", "child", "leaf"]);
  assert.deepEqual([...result.cyclicTableKeys], []);
});

void test("reports every member of a dependency cycle", () => {
  const dependencies = new Map<string, Set<string>>([
    ["a", new Set(["b"])],
    ["b", new Set(["c"])],
    ["c", new Set(["a"])],
  ]);

  const result = orderTablesByDependencies(["a", "b", "c"], dependencies);

  assert.deepEqual(result.tableKeys, ["c", "b", "a"]);
  assert.deepEqual([...result.cyclicTableKeys].sort(), ["a", "b", "c"]);
});

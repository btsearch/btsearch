import assert from "node:assert/strict";
import test from "node:test";

import { walkImports } from "./importGraph.ts";

const IMPORT_SPECIFIER = /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
const SERVER_ONLY_MODULES = /^(?:node:|(?:xlsx|cheerio|drizzle-orm|@openbts\/drizzle)(?:\/|$))/;
const SERVER_ONLY_FILES = /^(?:[^/]+\/sources\/|core\/sourceRegistry\.ts$|sources\.ts$)/;

function staticAndDynamicImports(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map(([, specifier = ""]) => specifier);
}

void test("nothing reachable from the package's main entry is server-only", () => {
  const graph = walkImports("index.ts", staticAndDynamicImports);

  assert.ok(graph.files.has("core/registry.ts") && graph.files.has("pl/index.ts") && graph.files.has("pl/conventions/cells.ts"));
  assert.deepEqual(
    [...graph.files].filter((file) => SERVER_ONLY_FILES.test(file)),
    [],
  );
  assert.deepEqual(
    [...graph.modules].filter((specifier) => SERVER_ONLY_MODULES.test(specifier)),
    [],
  );
});

void test("the same walk does find the readers from the sources entry", () => {
  const graph = walkImports("sources.ts", staticAndDynamicImports);

  assert.ok(graph.files.has("core/sourceRegistry.ts") && graph.files.has("pl/sources/uke/device-registry/parse.ts"));
  assert.deepEqual([...graph.modules].filter((specifier) => SERVER_ONLY_MODULES.test(specifier)).sort(), [
    "@openbts/drizzle",
    "@openbts/drizzle/db",
    "cheerio",
    "drizzle-orm",
    "drizzle-orm/pg-core",
    "drizzle-orm/zod",
    "node:fs",
    "node:fs/promises",
    "node:path",
    "node:stream",
    "node:zlib",
    "xlsx",
  ]);
});

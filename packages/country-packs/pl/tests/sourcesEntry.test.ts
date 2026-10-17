import assert from "node:assert/strict";
import test from "node:test";

import { walkImports } from "./importGraph.ts";

const STATIC_IMPORT = /^[ \t]*(?:import|export)\b(\s+type\b)?(?:[\w\s{},*$]*?\bfrom)?\s*["']([^"']+)["']/gm;
const LOADED_ON_FIRST_USE = /^(?:xlsx|cheerio|fflate)(?:\/|$)/;
const FILES_THAT_LOAD_THEM = ["pl/sources/uke/shared/workbook.ts", "pl/sources/uke/shared/page.ts", "pl/sources/uke/kmz/kml.ts"];

function staticImports(source: string): string[] {
  return [...source.matchAll(STATIC_IMPORT)].flatMap(([, typeKeyword, specifier = ""]) => (typeKeyword === undefined ? [specifier] : []));
}

void test("importing the sources entry loads no workbook, page or archive library", () => {
  const graph = walkImports("sources.ts", staticImports);

  assert.deepEqual(
    FILES_THAT_LOAD_THEM.filter((file) => !graph.files.has(file)),
    [],
  );
  assert.ok(graph.modules.has("drizzle-orm") && graph.modules.has("@openbts/drizzle") && graph.modules.has("node:fs/promises"));
  assert.deepEqual(
    [...graph.modules].filter((specifier) => LOADED_ON_FIRST_USE.test(specifier)),
    [],
  );
});

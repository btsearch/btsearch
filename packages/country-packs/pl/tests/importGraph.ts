import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../..");

export type ImportGraph = { files: Set<string>; modules: Set<string> };

export function walkImports(entryFile: string, importsOf: (source: string) => string[]): ImportGraph {
  const graph: ImportGraph = { files: new Set(), modules: new Set() };
  const pending = [resolve(PACKAGE_ROOT, entryFile)];

  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const packagePath = relative(PACKAGE_ROOT, file).replaceAll("\\", "/");
    if (graph.files.has(packagePath)) continue;
    graph.files.add(packagePath);

    for (const specifier of importsOf(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) pending.push(resolve(dirname(file), specifier));
      else graph.modules.add(specifier);
    }
  }

  return graph;
}

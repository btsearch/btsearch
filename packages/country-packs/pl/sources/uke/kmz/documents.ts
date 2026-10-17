import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { zipKml } from "./kml.ts";

export type KmzDocument = { path: string; kml: string };

export async function writeDocuments(directory: string, documents: Iterable<KmzDocument>): Promise<string[]> {
  const writtenPaths: string[] = [];
  for (const document of documents) {
    const filePath = path.join(directory, document.path);
    mkdirSync(path.dirname(filePath), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- one document is zipped and written before the next one is built
    writeFileSync(filePath, await zipKml(document.kml));
    writtenPaths.push(filePath);
  }

  return writtenPaths;
}

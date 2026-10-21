import path from "node:path";

import type { KmzExportContext } from "../../../../core/sources.ts";
import { writeDocuments } from "./documents.ts";
import { linkDocuments } from "./microwaveLinks.ts";
import { readLinks, readPermits } from "./read.ts";
import { siteDocuments } from "./sites.ts";

export async function exportKmz({ db, sourceId, directory, day, changedDatasets }: KmzExportContext): Promise<string[]> {
  const dayDirectory = path.join(directory, day);
  const sitePaths = changedDatasets.includes("permits")
    ? await writeDocuments(path.join(dayDirectory, "stations"), siteDocuments(await readPermits(db, sourceId), day))
    : [];
  const linkPaths = changedDatasets.includes("microwave-links")
    ? await writeDocuments(path.join(dayDirectory, "radiolines"), linkDocuments(await readLinks(db, sourceId), day))
    : [];

  return [...sitePaths, ...linkPaths];
}

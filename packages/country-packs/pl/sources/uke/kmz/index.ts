import path from "node:path";

import type { KmzExportContext } from "../../../../core/sources.ts";
import { writeDocuments } from "./documents.ts";
import { linkDocuments } from "./microwaveLinks.ts";
import { readLinks, readPermits } from "./read.ts";
import { siteDocuments } from "./sites.ts";

export async function exportKmz({ db, directory, day }: KmzExportContext): Promise<string[]> {
  const dayDirectory = path.join(directory, day);
  const sitePaths = await writeDocuments(path.join(dayDirectory, "stations"), siteDocuments(await readPermits(db), day));
  const linkPaths = await writeDocuments(path.join(dayDirectory, "radiolines"), linkDocuments(await readLinks(db), day));

  return [...sitePaths, ...linkPaths];
}

import { type ReadContext, type Release, WHOLE_DATASET_SLICE } from "../../../../core/sources.ts";
import { publishedOnFromFileName } from "../shared/dates.ts";
import { type PageLink, listXlsxLinks, noUsableFileError, releaseOf } from "../shared/page.ts";

const MICROWAVE_LINKS_PAGE_URL = "https://bip.uke.gov.pl/pozwolenia-radiowe/wykaz-pozwolen-radiowych-tresci/linie-radiowe,7.html";

function findNewestLink(links: readonly PageLink[]): PageLink | undefined {
  let newestLink: PageLink | undefined;
  let newestDate = "";
  for (const link of links) {
    const date = publishedOnFromFileName(link.fileName) ?? "";
    if (newestLink === undefined || date > newestDate) {
      newestLink = link;
      newestDate = date;
    }
  }

  return newestLink;
}

export async function discoverMicrowaveLinks(ctx: ReadContext): Promise<Release[]> {
  const newestLink = findNewestLink(await listXlsxLinks(ctx, MICROWAVE_LINKS_PAGE_URL));
  if (newestLink === undefined) throw noUsableFileError(MICROWAVE_LINKS_PAGE_URL);

  return [releaseOf(newestLink, WHOLE_DATASET_SLICE)];
}

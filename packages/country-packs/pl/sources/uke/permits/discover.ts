import type { ReadContext, Release } from "../../../../core/sources.ts";
import { labelSliceKey, parseFileLabel } from "../shared/labels.ts";
import { listXlsxLinks, noUsableFileError, releaseOf } from "../shared/page.ts";

const PERMITS_PAGE_URL = "https://bip.uke.gov.pl/pozwolenia-radiowe/wykaz-pozwolen-radiowych-tresci/stacje-gsm-umts-lte-5gnr-oraz-cdma,12,0.html";

export async function discoverPermits(ctx: ReadContext): Promise<Release[]> {
  const releases: Release[] = [];
  for (const link of await listXlsxLinks(ctx, PERMITS_PAGE_URL)) {
    const label = parseFileLabel(link.text);
    if (label) releases.push(releaseOf(link, labelSliceKey(label)));
    else ctx.log(`Could not parse band from file label: ${link.text}`);
  }
  if (releases.length === 0) throw noUsableFileError(PERMITS_PAGE_URL);

  return releases;
}

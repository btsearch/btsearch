import type { ReadContext, Release } from "../../../../core/sources.ts";
import { OPERATOR_NAME_BY_REGISTRY_FILE_KEY } from "../shared/licensees.ts";
import { listXlsxLinks, noUsableFileError, releaseOf } from "../shared/page.ts";

const DEVICE_REGISTRY_PAGE_URL = "https://bip.uke.gov.pl/pozwolenia-radiowe/rejestr-urzadzen/";
const OPERATOR_FILE_NAME = /^\d{4}-\d{2}-\d{2}_(.+)\.xlsx$/i;

export async function discoverDeviceRegistry(ctx: ReadContext): Promise<Release[]> {
  const releases: Release[] = [];
  for (const link of await listXlsxLinks(ctx, DEVICE_REGISTRY_PAGE_URL)) {
    const operatorKey = link.fileName.match(OPERATOR_FILE_NAME)?.[1]?.toLowerCase() ?? "";
    if (OPERATOR_NAME_BY_REGISTRY_FILE_KEY.has(operatorKey)) releases.push(releaseOf(link, operatorKey));
    else ctx.log(`Unknown operator key "${operatorKey}" in file name: ${link.fileName}`);
  }
  if (releases.length === 0) throw noUsableFileError(DEVICE_REGISTRY_PAGE_URL);

  return releases;
}

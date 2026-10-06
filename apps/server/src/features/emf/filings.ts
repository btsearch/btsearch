import type { EmfFilingList, EmfFilingListQuery } from "@openbts/shared/contract";
import { z } from "zod/v4";

import { ENTITY_TO_MNC } from "../pem/entities.js";
import { si2pemDateToInstant, si2pemDateToWarsawDay, toSI2PEMFileUrl } from "../pem/si2pemValues.js";
import { getVoivodeshipByTeryt } from "../pem/voivodeships.js";
import { type RegisterFilter, type SiteRow, registerFilters, resolveWindow, toPaging, withSiteRefs } from "./lists.js";
import { type RegisterReader, readRegisterWindow, registerCoordinate, registerReader, registerText } from "./register.js";
import { si2pem } from "./si2pem.js";

type FilingRow = SiteRow & {
  siteName: string | null;
  filerName: string | null;
  publishedAt: string;
  registeredOn: string | null;
  referenceNumber: string | null;
  installationDocumentUrl: string | null;
  reportUrl: string | null;
};

const FILINGS_CACHE = { freshTtlSeconds: 3600, staleTtlSeconds: 86400 };
const CACHE_KEY_PREFIX = "emf:filings:v1";

const registerFilingSchema = z.object({
  base_station: z.object({
    identity_name: registerText,
    name: registerText,
    operator: registerText,
    installation_operator_name: registerText,
    address: registerText,
    latitude: registerCoordinate,
    longitude: registerCoordinate,
    teryt: z.union([z.number(), z.string()]).nullish(),
  }),
  base_station_identity_name: registerText,
  venue_city: registerText,
  venue_address: registerText,
  published_at: registerText,
  entity: registerText,
  installation_file: registerText,
  report_file: registerText,
  registration_date: registerText,
  reference_no: registerText,
});

function cityFromAddress(address: string | null): string | null {
  const [city, ...rest] = (address ?? "").split(",");
  return rest.length > 0 ? city?.trim() || null : null;
}

function toFilingRow(result: unknown): FilingRow | null {
  const parsed = registerFilingSchema.safeParse(result);
  if (!parsed.success) return null;

  const { base_station: station, ...filing } = parsed.data;
  const publishedAt = si2pemDateToInstant(filing.published_at);
  if (publishedAt === null) return null;

  return {
    siteId: station.identity_name ?? filing.base_station_identity_name,
    siteName: station.name,
    mnc:
      ENTITY_TO_MNC[filing.entity ?? ""] ?? ENTITY_TO_MNC[station.installation_operator_name ?? ""] ?? ENTITY_TO_MNC[station.operator ?? ""] ?? null,
    regionName: getVoivodeshipByTeryt(station.teryt),
    latitude: station.latitude,
    longitude: station.longitude,
    city: filing.venue_city ?? cityFromAddress(station.address),
    address: filing.venue_address ?? station.address,
    filerName: filing.entity ?? station.installation_operator_name ?? station.operator,
    publishedAt,
    registeredOn: si2pemDateToWarsawDay(filing.registration_date),
    referenceNumber: filing.reference_no,
    installationDocumentUrl: toSI2PEMFileUrl(filing.installation_file),
    reportUrl: toSI2PEMFileUrl(filing.report_file),
  };
}

function filingsReader({ entityName, voivodeship }: RegisterFilter, siteId: string | undefined): RegisterReader<FilingRow> {
  return registerReader({
    cacheKeyPrefix: CACHE_KEY_PREFIX,
    cacheKeyParts: [entityName, voivodeship, siteId],
    cache: FILINGS_CACHE,
    voivodeship,
    fetchPage: (page, pageSize) =>
      si2pem.listInstallations({ baseStation: siteId ?? "", entity: entityName, voivodeship: voivodeship?.toLowerCase(), page, pageSize }),
    toRow: toFilingRow,
  });
}

export async function listEmfFilings(query: EmfFilingListQuery): Promise<EmfFilingList> {
  const window = resolveWindow(query);
  const readers = (await registerFilters(query)).map((filter) => filingsReader(filter, query.siteId));
  const { total, rows } = await readRegisterWindow(readers, window);

  return {
    data: (await withSiteRefs(rows, query.include)).map(({ row, refs }) => ({
      ...refs,
      siteName: row.siteName,
      filerName: row.filerName,
      publishedAt: row.publishedAt,
      registeredOn: row.registeredOn,
      referenceNumber: row.referenceNumber,
      installationDocumentUrl: row.installationDocumentUrl,
      reportUrl: row.reportUrl,
    })),
    paging: toPaging(window, total, query.includeTotal),
  };
}

import type { EmfReport } from "@openbts/shared/contract";
import { type SI2PEMMeasureProperties, SI2PEM_WMS_LAYERS, escapeCqlLiteral } from "si2pem-reader";

import { withRedisStaleCache } from "../../lib/redisCache.js";
import { MNC_TO_ENTITY } from "../pem/entities.js";
import { si2pemDateToInstant, si2pemDateToWarsawDay, toSI2PEMFileUrl } from "../pem/si2pemValues.js";
import { si2pem } from "./si2pem.js";
import { type EmfSite, siteBox } from "./site.js";

const REPORTS_CACHE = { freshTtlSeconds: 86400, staleTtlSeconds: 7 * 86400 };
const CACHE_KEY_PREFIX = "emf:reports:v1";
const MEASUREMENT_REPORT_LIMIT = 200;
const FILING_REPORT_LIMIT = 25;
const LABORATORY_MEASURE_TYPE = "lab";

function reportDate(report: EmfReport): string {
  return report.publishedAt ?? report.measuredOn ?? "";
}

function newestFirst(reports: EmfReport[]): EmfReport[] {
  return reports.toSorted((a, b) => reportDate(b).localeCompare(reportDate(a)));
}

function withoutRepeatedUrls(reports: EmfReport[]): EmfReport[] {
  const seen = new Set<string>();
  return newestFirst(reports).filter((report) => {
    if (seen.has(report.url)) return false;
    seen.add(report.url);
    return true;
  });
}

async function fetchMeasurementReports(site: EmfSite): Promise<EmfReport[]> {
  const json = await si2pem.getWmsFeatureInfo<SI2PEMMeasureProperties>({
    layer: SI2PEM_WMS_LAYERS.measurementResults,
    bbox: siteBox(site),
    cqlFilter: `identity_names='${escapeCqlLiteral(site.siteId)}' AND url IS NOT NULL`,
    featureCount: MEASUREMENT_REPORT_LIMIT,
    sortBy: "year D,date D",
  });

  return withoutRepeatedUrls(
    (json.features ?? []).flatMap(({ properties }) => {
      const url = toSI2PEMFileUrl(properties.url);
      const measuredOn = si2pemDateToWarsawDay(properties.date);
      if (url === null || measuredOn === null) return [];
      return [
        {
          kind: "measurement" as const,
          url,
          measuredOn,
          registeredOn: null,
          publishedAt: null,
          laboratoryName: properties.source?.trim() || null,
          filerName: null,
          installationDocumentUrl: null,
          hasAntennaTable: properties.measure_type === LABORATORY_MEASURE_TYPE,
        },
      ];
    }),
  );
}

async function fetchFilingReports(siteId: string, entityName: string): Promise<EmfReport[]> {
  const json = await si2pem.listInstallations({ baseStation: siteId, entity: entityName, page: 1, pageSize: FILING_REPORT_LIMIT });

  return withoutRepeatedUrls(
    (json.results ?? []).flatMap((filing) => {
      const url = toSI2PEMFileUrl(filing.report_file);
      const publishedAt = si2pemDateToInstant(filing.published_at);
      if (url === null || publishedAt === null || filing.base_station?.identity_name !== siteId) return [];
      return [
        {
          kind: "filing" as const,
          url,
          measuredOn: null,
          registeredOn: si2pemDateToWarsawDay(filing.registration_date),
          publishedAt,
          laboratoryName: null,
          filerName: filing.entity?.trim() || null,
          installationDocumentUrl: toSI2PEMFileUrl(filing.installation_file),
          hasAntennaTable: false,
        },
      ];
    }),
  );
}

async function cachedReports(key: string, load: () => Promise<EmfReport[]>): Promise<EmfReport[]> {
  const { value } = await withRedisStaleCache(`${CACHE_KEY_PREFIX}:${key}`, REPORTS_CACHE, load);
  return value;
}

export async function listEmfReports(site: EmfSite): Promise<EmfReport[]> {
  const siteKey = encodeURIComponent(site.siteId);
  const entityName = site.mnc === null ? undefined : MNC_TO_ENTITY[site.mnc];

  const requests = [cachedReports(`measurements:${siteKey}:${site.latitude}:${site.longitude}`, () => fetchMeasurementReports(site))];
  if (entityName !== undefined) requests.push(cachedReports(`filings:${siteKey}:${site.mnc}`, () => fetchFilingReports(site.siteId, entityName)));

  const results = await Promise.allSettled(requests);
  const reports = newestFirst(results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (reports.length === 0 && failure) throw failure.reason;

  return reports;
}

import type { CellRat, EmfAntenna, EmfAntennaReport, EmfReportHead } from "@openbts/shared/contract";
import { createHash } from "node:crypto";
import { SI2PEM_ERROR_CODES, isSI2PEMError } from "si2pem-reader";
import { type SI2PEMAntennaRow, parseAntennaReport } from "si2pem-reader/reports";

import { ErrorResponse } from "../../errors.js";
import { withRedisStaleCache } from "../../lib/redisCache.js";
import { errorMessage } from "../../utils/errorMessage.js";
import { logger } from "../../utils/logger.js";
import { si2pemDateToWarsawDay, toSI2PEMFileUrl } from "../pem/si2pemValues.js";
import { ReportReadQueueFullError, si2pem } from "./si2pem.js";
import { type EmfSite, siteBox } from "./site.js";

const LABORATORY_REPORTS_CACHE = { freshTtlSeconds: 86400, staleTtlSeconds: 7 * 86400 };
const ANTENNAS_CACHE = { freshTtlSeconds: 7 * 86400, staleTtlSeconds: 14 * 86400, lockTtlSeconds: 60 };
const LABORATORY_REPORT_LIMIT = 200;
const MAX_CONCURRENT_READS = 2;
const MAX_WAITING_READS = 8;
const REPORT_RATS: Record<string, CellRat> = { GSM: "gsm", DCS: "gsm", UMTS: "umts", WCDMA: "umts", LTE: "lte", NR: "nr" };

let activeReads = 0;
const waitingReads: (() => void)[] = [];

async function withReadSlot<T>(read: () => Promise<T>): Promise<T> {
  if (activeReads < MAX_CONCURRENT_READS) {
    activeReads += 1;
  } else if (waitingReads.length < MAX_WAITING_READS) {
    await new Promise<void>((resolve) => {
      waitingReads.push(resolve);
    });
  } else {
    throw new ReportReadQueueFullError();
  }

  try {
    return await read();
  } finally {
    const next = waitingReads.shift();
    if (next) next();
    else activeReads -= 1;
  }
}

function toEmfAntenna(row: SI2PEMAntennaRow): EmfAntenna {
  return {
    rowNumber: row.rowNumber,
    pageNumber: row.pageNumber,
    model: row.antenna.model,
    manufacturer: row.antenna.manufacturer,
    heightMeters: row.antenna.mountedHeight,
    azimuth: row.antenna.azimuth,
    totalEirpWatts: row.totalEirp,
    bands: row.bands.map((band) => ({
      label: band.label,
      rat: band.rat === null ? null : (REPORT_RATS[band.rat] ?? null),
      frequencyMhz: band.value,
      eirpWatts: band.eirp,
      tiltRange: band.tiltRange ? { min: band.tiltRange.minimum, max: band.tiltRange.maximum } : null,
      measuredTilt: band.measuredTilt,
    })),
  };
}

async function listLaboratoryReports(site: EmfSite): Promise<EmfReportHead[]> {
  const key = `emf:laboratory-reports:v2:${encodeURIComponent(site.siteId)}:${site.latitude}:${site.longitude}`;
  const { value } = await withRedisStaleCache(key, LABORATORY_REPORTS_CACHE, async () => {
    const reports = await si2pem.findLaboratoryReports({ stationIdentity: site.siteId, bbox: siteBox(site), count: LABORATORY_REPORT_LIMIT });
    return reports.flatMap((report) => {
      const url = toSI2PEMFileUrl(report.url);
      if (url === null) return [];
      return [{ url, measuredOn: si2pemDateToWarsawDay(report.publishedAt), laboratoryName: report.laboratoryName?.trim() || null }];
    });
  });
  return value;
}

async function readReport(siteId: string, report: EmfReportHead): Promise<EmfAntennaReport> {
  const pdf = await si2pem.downloadReport(report.url).catch((error: unknown) => {
    if (isSI2PEMError(error) && error.code === SI2PEM_ERROR_CODES.responseTooLarge) return null;
    throw error;
  });
  if (pdf === null) return { report, antennas: [] };

  const parsed = await parseAntennaReport(pdf, { expectedStationIdentity: siteId }).catch((error: unknown) => {
    logger.warn("emf_report_unreadable", { url: report.url, reason: errorMessage(error) });
    return null;
  });
  return { report, antennas: parsed === null ? [] : parsed.rows.map(toEmfAntenna) };
}

export async function readEmfAntennas(site: EmfSite, reportUrl: string | undefined, beforeRead: () => Promise<void>): Promise<EmfAntennaReport> {
  const requestedUrl = reportUrl === undefined ? undefined : toSI2PEMFileUrl(reportUrl);
  if (requestedUrl === null) throw new ErrorResponse("NOT_FOUND");

  const newest = requestedUrl === undefined ? (await listLaboratoryReports(site))[0] : undefined;
  const url = requestedUrl ?? newest?.url;
  if (url === undefined) return { report: null, antennas: [] };

  const key = `emf:antennas:v1:${createHash("sha256")
    .update(JSON.stringify([site.siteId, url]))
    .digest("hex")}`;
  const { value } = await withRedisStaleCache(key, ANTENNAS_CACHE, async () => {
    const report = newest ?? (await listLaboratoryReports(site)).find((candidate) => candidate.url === url);
    if (report === undefined) throw new ErrorResponse("NOT_FOUND");

    await beforeRead();
    return withReadSlot(() => readReport(site.siteId, report));
  });
  return value;
}

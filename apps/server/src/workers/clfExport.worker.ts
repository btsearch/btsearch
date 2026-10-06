import { bands, cells, lteCells, nrCells, regions, stations } from "@openbts/drizzle";
import type { CLFDescriptionTemplates } from "@openbts/shared/clfExportTemplates";
import { type SQL, eq, gte, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parentPort } from "node:worker_threads";

import { LEGACY_COUNTRY_CODE } from "../constants.js";
import type { ClfFormat, ConvertOptions } from "../features/clfExport/converter.js";
import { loadExportLines } from "../features/clfExport/lines.js";
import { stationIdInLegacyCountry } from "../features/countries/legacy.js";
import { serializeWorkerError } from "./clfExportProtocol.js";

if (!parentPort) throw new Error("This file must be run as a worker thread");
const workerPort = parentPort;

const CLF_TMP_DIR = join(tmpdir(), "clf-exports");

type WorkerParams = {
  format: ClfFormat;
  operatorIds?: number[];
  regionCodes?: string[];
  rat?: ("GSM" | "UMTS" | "LTE" | "NR" | "IOT")[];
  bandIds?: number[];
  since?: string;
  templates?: CLFDescriptionTemplates;
  displayNRSeparately?: boolean;
};

workerPort.on("message", async (params: WorkerParams) => {
  try {
    const { format, operatorIds, regionCodes, rat, bandIds, since, templates, displayNRSeparately } = params;
    const convertOptions: ConvertOptions = {};
    if (templates !== undefined) convertOptions.templates = templates;
    if (displayNRSeparately === true) convertOptions.displayNRSeparately = true;

    const stationConditions: SQL[] = [eq(stations.status, "published"), stationIdInLegacyCountry(stations.id)];
    if (operatorIds && operatorIds.length > 0) stationConditions.push(inArray(stations.operator_id, operatorIds));
    if (regionCodes && regionCodes.length > 0) {
      stationConditions.push(inArray(regions.code, regionCodes), eq(regions.countryCode, LEGACY_COUNTRY_CODE));
    }

    const cellConditions: SQL[] = [];
    if (bandIds && bandIds.length > 0) cellConditions.push(inArray(bands.value, bandIds));
    if (since) cellConditions.push(gte(cells.updatedAt, new Date(since)));

    const clfLines = await loadExportLines(
      {
        stationConditions,
        cellConditions,
        lteConditions: rat?.includes("IOT") && !rat.includes("LTE") ? [eq(lteCells.supports_iot, true)] : [],
        nrConditions: rat?.includes("IOT") && !rat.includes("NR") ? [eq(nrCells.supports_nr_redcap, true)] : [],
        rats: {
          gsm: !rat || rat.includes("GSM"),
          umts: !rat || rat.includes("UMTS"),
          lte: !rat || rat.includes("LTE") || rat.includes("IOT"),
          nr: !rat || rat.includes("NR") || rat.includes("IOT"),
        },
      },
      format,
      convertOptions,
    );

    clfLines.sort();

    await mkdir(CLF_TMP_DIR, { recursive: true });
    const tmpPath = join(CLF_TMP_DIR, `${randomUUID()}.txt`);
    await writeFile(tmpPath, clfLines.join("\n") + "\n");

    workerPort.postMessage({ success: true, tmpPath });
  } catch (e) {
    workerPort.postMessage({ success: false, error: serializeWorkerError(e) });
  }
});

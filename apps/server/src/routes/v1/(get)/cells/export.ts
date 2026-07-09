import { bands, cells, locations, regions, stations } from "@openbts/drizzle";
import {
  type CLFDescriptionTemplateParam,
  type CLFDescriptionTemplates,
  CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH,
  CLF_DESCRIPTION_TEMPLATE_PARAM_BY_RAT,
  CLF_DESCRIPTION_TEMPLATE_RATS,
  DISPLAY_NR_SEPARATELY_PARAM,
} from "@openbts/shared/clfExportTemplates";
import { and, eq, gte, inArray, max } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
// oxlint-disable no-await-in-loop
import { createReadStream, existsSync } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import redis from "../../../../database/redis.js";
import type { Route } from "../../../../interfaces/routes.interface.js";
import { type SerializedWorkerError, deserializeWorkerError } from "../../../../lib/workerError.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, "../../../../workers/clfExport.worker.js");

const CACHE_TTL = 3600; // 1h
const CLF_TMP_DIR = join(tmpdir(), "clf-exports");
const NETWORKS_MNC = 26034;
const NETWORKS_CHILD_MNCS = [26002, 26003];
const templateParamSchema = z
  .string()
  .trim()
  .max(CLF_DESCRIPTION_TEMPLATE_MAX_LENGTH)
  .optional()
  .transform((val) => (val ? val : undefined));
const templateParamSchemas = Object.fromEntries(
  CLF_DESCRIPTION_TEMPLATE_RATS.map((rat) => [CLF_DESCRIPTION_TEMPLATE_PARAM_BY_RAT[rat], templateParamSchema]),
) as Record<CLFDescriptionTemplateParam, typeof templateParamSchema>;

type TemplateQueryFields = Partial<Record<CLFDescriptionTemplateParam, string | undefined>>;

function getEffectiveDescriptionTemplates(query: TemplateQueryFields): CLFDescriptionTemplates | undefined {
  const templates: CLFDescriptionTemplates = {};
  for (const rat of CLF_DESCRIPTION_TEMPLATE_RATS) {
    const template = query[CLF_DESCRIPTION_TEMPLATE_PARAM_BY_RAT[rat]];
    if (template !== undefined) templates[rat] = template;
  }

  return Object.keys(templates).length > 0 ? templates : undefined;
}

async function cleanupOldExports() {
  try {
    if (!existsSync(CLF_TMP_DIR)) return;
    const files = await readdir(CLF_TMP_DIR);
    const now = Date.now();
    for (const file of files) {
      const filePath = join(CLF_TMP_DIR, file);
      const fileStat = await stat(filePath).catch(() => null);
      if (fileStat && now - fileStat.mtimeMs > CACHE_TTL * 1000) await unlink(filePath).catch(() => {});
    }
  } catch {}
}

setInterval(cleanupOldExports, CACHE_TTL * 1000);

const schemaRoute = {
  querystring: z.object({
    format: z.enum(["2.0", "2.1", "3.0-dec", "3.0-hex", "4.0", "ntm", "netmonitor"]).default("4.0"),
    operators: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    regions: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(",")
              .map((code) => code.trim().toUpperCase())
              .filter((code) => code.length === 3)
          : undefined,
      ),
    rat: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const validRats = new Set(["GSM", "UMTS", "LTE", "NR", "IOT"]);
        const rats = val.split(",").filter((r) => validRats.has(r.toUpperCase()));
        return rats.length > 0 ? (rats.map((r) => r.toUpperCase()) as ("GSM" | "UMTS" | "LTE" | "NR" | "IOT")[]) : undefined;
      }),
    bands: z
      .string()
      .optional()
      .transform((val) =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    since: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    ...templateParamSchemas,
    [DISPLAY_NR_SEPARATELY_PARAM]: z
      .string()
      .optional()
      .transform((val) => val === "true" || val === "1"),
  }),
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

async function resolveOperatorIds(operatorMncs?: number[]): Promise<number[] | undefined> {
  if (!operatorMncs || operatorMncs.length === 0) return undefined;
  const mncs = new Set(operatorMncs);
  if (mncs.has(NETWORKS_MNC)) for (const child of NETWORKS_CHILD_MNCS) mncs.add(child);
  const matched = await db.query.operators.findMany({ where: { mnc: { in: [...mncs] } }, columns: { id: true } });
  return matched.map((o) => o.id);
}

async function getLastModified({
  operatorIds,
  regionCodes,
  rat,
  bandIds,
  since,
}: {
  operatorIds?: number[];
  regionCodes?: string[];
  rat?: ("GSM" | "UMTS" | "LTE" | "NR" | "IOT")[];
  bandIds?: number[];
  since?: string;
}): Promise<Date | null> {
  const conditions = [eq(stations.status, "published")];
  if (operatorIds && operatorIds.length > 0) conditions.push(inArray(stations.operator_id, operatorIds));
  if (regionCodes && regionCodes.length > 0) conditions.push(inArray(regions.code, regionCodes));
  if (bandIds && bandIds.length > 0) conditions.push(inArray(bands.value, bandIds));
  if (since) conditions.push(gte(cells.updatedAt, new Date(since)));
  if (rat && rat.length > 0) {
    const ratSet = new Set(rat);
    const dbRats: ("GSM" | "UMTS" | "LTE" | "NR" | "IOT")[] = [];
    if (ratSet.has("GSM")) dbRats.push("GSM");
    if (ratSet.has("UMTS")) dbRats.push("UMTS");
    if (ratSet.has("LTE") || ratSet.has("IOT")) dbRats.push("LTE");
    if (ratSet.has("NR") || ratSet.has("IOT")) dbRats.push("NR");
    conditions.push(inArray(cells.rat, dbRats));
  }

  const [result] = await db
    .select({ lastModified: max(cells.updatedAt) })
    .from(cells)
    .innerJoin(stations, eq(cells.station_id, stations.id))
    .innerJoin(bands, and(eq(cells.band_id, bands.id), eq(bands.variant, "commercial")))
    .leftJoin(locations, eq(stations.location_id, locations.id))
    .leftJoin(regions, eq(locations.region_id, regions.id))
    .where(and(...conditions));

  return result?.lastModified ? new Date(result.lastModified) : null;
}

async function resolveExportMetadata(params: {
  operatorMncs?: number[];
  regionCodes?: string[];
  rat?: ("GSM" | "UMTS" | "LTE" | "NR" | "IOT")[];
  bandIds?: number[];
  since?: string;
}): Promise<{ operatorIds?: number[]; lastModified: Date | null }> {
  const operatorIds = await resolveOperatorIds(params.operatorMncs);
  const lastModified = await getLastModified({
    operatorIds,
    regionCodes: params.regionCodes,
    rat: params.rat,
    bandIds: params.bandIds,
    since: params.since,
  });
  return { operatorIds, lastModified };
}

async function handler(req: FastifyRequest<ReqQuery>, res: FastifyReply) {
  const { format, operators: operatorMncs, regions: regionCodes, rat, bands: bandIds, since } = req.query;

  const effectiveTemplates = getEffectiveDescriptionTemplates(req.query);
  const displayNRSeparately = format === "ntm" && req.query[DISPLAY_NR_SEPARATELY_PARAM];
  const cacheKey = `clf:export:${JSON.stringify({
    format,
    operatorMncs,
    regionCodes,
    rat,
    bandIds,
    since,
    templates: effectiveTemplates,
    displayNRSeparately,
  })}`;
  const lastModifiedKey = `${cacheKey}:lm`;

  const [{ operatorIds, lastModified }, cachedLm, cachedTmpPath] = await Promise.all([
    resolveExportMetadata({ operatorMncs, regionCodes, rat, bandIds, since }),
    redis.get(lastModifiedKey),
    redis.get(cacheKey),
  ]);
  const lastModifiedIso = lastModified?.toISOString() ?? null;

  let tmpPath = cachedTmpPath && existsSync(cachedTmpPath) && cachedLm === lastModifiedIso ? cachedTmpPath : null;

  if (!tmpPath) {
    tmpPath = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(WORKER_PATH, { execArgv: process.execArgv });
      worker.postMessage({
        format,
        operatorIds,
        regionCodes,
        rat,
        bandIds,
        since,
        templates: effectiveTemplates,
        displayNRSeparately,
      });
      worker.on("message", ({ success, tmpPath, error }: { success: boolean; tmpPath?: string; error?: SerializedWorkerError | string }) => {
        void worker.terminate();
        if (success && tmpPath !== undefined) resolve(tmpPath);
        else reject(deserializeWorkerError(error));
      });
      worker.on("error", (err) => {
        void worker.terminate();
        reject(err);
      });
    });

    await Promise.all([
      redis.setEx(cacheKey, CACHE_TTL, tmpPath),
      lastModifiedIso !== null ? redis.setEx(lastModifiedKey, CACHE_TTL, lastModifiedIso) : Promise.resolve(),
    ]);
  }

  const fileExtension = format === "ntm" ? "ntm" : format === "netmonitor" ? "csv" : "clf";
  const { size } = await stat(tmpPath);
  res.header("Content-Type", "text/plain; charset=utf-8");
  res.header("Content-Length", size);
  if (lastModified !== null) res.header("Last-Modified", lastModified.toUTCString());
  res.header("Content-Disposition", `attachment; filename="cells_export_${format}.${fileExtension}"`);

  return res.send(createReadStream(tmpPath));
}

const getCellsExport: Route<ReqQuery, string> = {
  url: "/cells/export",
  method: "GET",
  config: { permissions: ["read:cells"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getCellsExport;

import type { FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import type { Route } from "../../../../interfaces/routes.interface.js";

const KMZ_DIR = process.env.KMZ_OUTPUT_DIR ?? "kmz_output";

const KMZ_TYPES = ["stations", "radiolines"] as const;
const KMZ_SOURCES = ["all", "permits", "device_registry"] as const;

type KmzType = (typeof KMZ_TYPES)[number];
type KmzSource = (typeof KMZ_SOURCES)[number];

const schemaRoute = {
  querystring: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(KMZ_TYPES),
    source: z.enum(KMZ_SOURCES),
    region: z
      .string()
      .regex(/^([A-Z]{3}|UNKNOWN)$/)
      .optional(),
    new: z.coerce.boolean().optional().default(false),
  }),
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

async function resolveKmzPath(
  date: string,
  type: KmzType,
  source: KmzSource,
  region?: string,
  wantsNew = false,
): Promise<{ filePath: string; filename: string } | null> {
  const subDir = source !== "all" ? join(date, type, source) : join(date, type);
  const dir = join(KMZ_DIR, subDir);

  if (wantsNew) {
    const newFileRegex = new RegExp(`^${type}_new_\\d{4}-\\d{2}-\\d{2}\\.kmz$`);
    const entries = await readdir(dir).catch(() => [] as string[]);
    const filename = entries
      .filter((entry) => newFileRegex.test(entry))
      .sort()
      .at(-1);
    if (!filename) return null;

    return { filePath: join(dir, filename), filename };
  }

  const regionSuffix = region ? `_${region}` : "";
  const sourceSuffix = source !== "all" ? `_${source}` : "";
  const filename = `${type}_${date}${sourceSuffix}${regionSuffix}.kmz`;

  return { filePath: join(dir, filename), filename };
}

async function handler(req: FastifyRequest<ReqQuery>, res: FastifyReply) {
  const { date, type, source, region, new: wantsNew } = req.query;
  const resolved = await resolveKmzPath(date, type, source, region, wantsNew);
  if (!resolved) throw new ErrorResponse("NOT_FOUND", { message: "KMZ file not found" });

  const { filePath, filename } = resolved;

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) throw new ErrorResponse("NOT_FOUND", { message: "KMZ file not found" });

  res.header("Content-Type", "application/vnd.google-earth.kmz");
  res.header("Content-Length", fileStat.size);
  res.header("Content-Disposition", `attachment; filename="${filename}"`);

  return res.send(createReadStream(filePath));
}

const getKmzDownload: Route<ReqQuery> = {
  url: "/kmz/download",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getKmzDownload;

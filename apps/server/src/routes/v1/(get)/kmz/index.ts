import { regions } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
// oxlint-disable no-await-in-loop
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod/v4";

import { LEGACY_COUNTRY_CODE } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const KMZ_DIR = process.env.KMZ_OUTPUT_DIR ?? "kmz_output";

const KMZ_TYPES = ["stations", "radiolines"] as const;
const KMZ_SOURCES = ["all", "permits", "device_registry"] as const;
const DATE_DIR_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const REGION_FILENAME_REGEX = /_([A-Z]{3})\.kmz$/;

type KmzType = (typeof KMZ_TYPES)[number];
type KmzSource = (typeof KMZ_SOURCES)[number];
type KmzSourceDirectory = Exclude<KmzSource, "all">;

const regionsSchema = createSelectSchema(regions);
type RegionRow = z.infer<typeof regionsSchema>;
const regionsQuery = db.query.regions.findMany({ where: { countryCode: LEGACY_COUNTRY_CODE } }).prepare("kmz_regions_all");

interface KmzFile {
  date: string;
  type: KmzType;
  source: KmzSource;
  region: RegionRow | null;
  filename: string;
  size: number;
}

interface KmzListResponse {
  data: KmzFile[];
  totalCount: number;
}

const schemaRoute = {
  querystring: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    type: z.enum(KMZ_TYPES).optional(),
    source: z.enum(KMZ_SOURCES).optional(),
    region: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          date: z.string(),
          type: z.enum(KMZ_TYPES),
          source: z.enum(KMZ_SOURCES),
          region: regionsSchema.nullable(),
          filename: z.string(),
          size: z.number(),
        }),
      ),
      totalCount: z.number(),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

function regionCodeFromFilename(filename: string): string | null {
  return filename.match(REGION_FILENAME_REGEX)?.[1] ?? null;
}

function isKmzSourceDirectory(entry: string): entry is KmzSourceDirectory {
  return entry !== "all" && (KMZ_SOURCES as readonly string[]).includes(entry);
}

function appendKmzFile(
  files: KmzFile[],
  date: string,
  type: KmzType,
  source: KmzSource,
  filename: string,
  size: number,
  regionMap: Map<string, RegionRow>,
): void {
  const regionCode = regionCodeFromFilename(filename);
  files.push({
    date,
    type,
    source,
    region: regionCode ? (regionMap.get(regionCode) ?? null) : null,
    filename,
    size,
  });
}

async function collectAllFiles(regionMap: Map<string, RegionRow>): Promise<KmzFile[]> {
  if (!existsSync(KMZ_DIR)) return [];

  const files: KmzFile[] = [];
  const dateDirs = await readdir(KMZ_DIR).catch(() => [] as string[]);

  for (const dateEntry of dateDirs) {
    if (!DATE_DIR_REGEX.test(dateEntry)) continue;

    const dateDir = join(KMZ_DIR, dateEntry);

    for (const type of KMZ_TYPES) {
      const typeDir = join(dateDir, type);
      if (!existsSync(typeDir)) continue;

      const topEntries = await readdir(typeDir).catch(() => [] as string[]);

      for (const entry of topEntries) {
        const entryPath = join(typeDir, entry);
        const entryStat = await stat(entryPath).catch(() => null);
        if (!entryStat) continue;

        if (entryStat.isFile() && entry.endsWith(".kmz")) {
          appendKmzFile(files, dateEntry, type, "all", entry, entryStat.size, regionMap);
          continue;
        }

        if (!entryStat.isDirectory() || !isKmzSourceDirectory(entry)) continue;

        const subEntries = await readdir(entryPath).catch(() => [] as string[]);
        for (const subFile of subEntries) {
          if (!subFile.endsWith(".kmz")) continue;

          const subStat = await stat(join(entryPath, subFile)).catch(() => null);
          if (!subStat?.isFile()) continue;

          appendKmzFile(files, dateEntry, type, entry, subFile, subStat.size, regionMap);
        }
      }
    }
  }

  return files;
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<KmzListResponse>>) {
  const { date, type, source, region, page, limit } = req.query;

  const regionRows = await regionsQuery.execute();
  const regionMap = new Map(regionRows.map((row) => [row.code, row]));

  let files = await collectAllFiles(regionMap);

  if (date) files = files.filter((f) => f.date === date);
  if (type) files = files.filter((f) => f.type === type);
  if (source) files = files.filter((f) => f.source === source);
  if (region !== undefined) files = files.filter((f) => f.region?.code === region);

  files.sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type) || a.filename.localeCompare(b.filename));

  const totalCount = files.length;
  const paged = files.slice((page - 1) * limit, page * limit);

  return res.send({
    data: paged,
    totalCount,
  });
}

const getKmzList: Route<ReqQuery, KmzListResponse> = {
  url: "/kmz",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getKmzList;

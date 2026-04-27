import { bands, operators, statsSnapshots, ukeImportMetadata } from "@openbts/drizzle";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import redis from "../../../../../database/redis.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const CACHE_TTL = 86400; // 24h

const schemaRoute = {
  querystring: z.object({
    operator_id: z.coerce.number().int().optional(),
    band_id: z.coerce.number().int().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    granularity: z.enum(["daily", "monthly"]).optional().default("monthly"),
  }),
  response: {
    200: z.object({
      data: z.array(
        z.object({
          date: z.string(),
          operator: z.object({ id: z.number(), name: z.string() }),
          band: z.object({ id: z.number(), name: z.string() }),
          unique_stations: z.number(),
          permits_count: z.number(),
        }),
      ),
    }),
  },
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };

interface HistoryRow {
  date: string;
  operator: { id: number; name: string };
  band: { id: number; name: string };
  unique_stations: number;
  permits_count: number;
}

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<HistoryRow[]>>) {
  const { operator_id, band_id, from, to, granularity } = req.query;
  const cacheKey = `stats:permits:history:${granularity}:${operator_id ?? "all"}:${band_id ?? "all"}:${from?.toISOString() ?? ""}:${to?.toISOString() ?? ""}`;

  const cached = await redis.get(cacheKey);
  if (cached) return res.send(JSON.parse(cached));

  const conditions = [];
  if (operator_id) conditions.push(eq(statsSnapshots.operator_id, operator_id));
  if (band_id) conditions.push(eq(statsSnapshots.band_id, band_id));
  if (from) conditions.push(gte(statsSnapshots.snapshot_date, from));
  if (to) conditions.push(lte(statsSnapshots.snapshot_date, to));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const mapRows = (
    rows: {
      date: Date;
      operator_id: number;
      operator_name: string;
      band_id: number;
      band_name: string;
      unique_stations: number;
      permits_count: number;
    }[],
  ) =>
    rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      operator: { id: r.operator_id, name: r.operator_name },
      band: { id: r.band_id, name: r.band_name },
      unique_stations: r.unique_stations,
      permits_count: r.permits_count,
    }));

  if (granularity === "daily") {
    const rows = await db
      .select({
        date: statsSnapshots.snapshot_date,
        operator_id: operators.id,
        operator_name: operators.name,
        band_id: bands.id,
        band_name: bands.name,
        unique_stations: statsSnapshots.unique_stations_count,
        permits_count: statsSnapshots.permits_count,
      })
      .from(statsSnapshots)
      .innerJoin(operators, eq(statsSnapshots.operator_id, operators.id))
      .innerJoin(bands, eq(statsSnapshots.band_id, bands.id))
      .where(whereClause)
      .orderBy(statsSnapshots.snapshot_date);

    const response = { data: mapRows(rows) };
    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
    return res.send(response);
  }

  const [rows, importRows] = await Promise.all([
    db
      .selectDistinctOn([sql`date_trunc('month', ${statsSnapshots.snapshot_date})`, statsSnapshots.operator_id, statsSnapshots.band_id], {
        date: statsSnapshots.snapshot_date,
        operator_id: operators.id,
        operator_name: operators.name,
        band_id: bands.id,
        band_name: bands.name,
        unique_stations: statsSnapshots.unique_stations_count,
        permits_count: statsSnapshots.permits_count,
      })
      .from(statsSnapshots)
      .innerJoin(operators, eq(statsSnapshots.operator_id, operators.id))
      .innerJoin(bands, eq(statsSnapshots.band_id, bands.id))
      .where(whereClause)
      .orderBy(
        sql`date_trunc('month', ${statsSnapshots.snapshot_date})`,
        statsSnapshots.operator_id,
        statsSnapshots.band_id,
        statsSnapshots.snapshot_date,
      ),
    db
      .selectDistinctOn([sql`date_trunc('month', ${ukeImportMetadata.last_import_date})`], {
        date: ukeImportMetadata.last_import_date,
      })
      .from(ukeImportMetadata)
      .where(and(eq(ukeImportMetadata.import_type, "permits"), eq(ukeImportMetadata.status, "success")))
      .orderBy(sql`date_trunc('month', ${ukeImportMetadata.last_import_date})`, desc(ukeImportMetadata.last_import_date)),
  ]);

  const importDateByMonth = new Map(importRows.map((r) => [r.date.toISOString().slice(0, 7), r.date.toISOString().slice(0, 10)]));

  const response = {
    data: rows.map((r) => ({
      date: importDateByMonth.get(r.date.toISOString().slice(0, 7)) ?? r.date.toISOString().slice(0, 10),
      operator: { id: r.operator_id, name: r.operator_name },
      band: { id: r.band_id, name: r.band_name },
      unique_stations: r.unique_stations,
      permits_count: r.permits_count,
    })),
  };
  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(response));
  res.send(response);
}

const getStatsPermitsHistory: Route<ReqQuery, HistoryRow[]> = {
  url: "/stats/permits/history",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  handler,
};

export default getStatsPermitsHistory;

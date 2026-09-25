import { deletedEntries, ukeImportMetadata } from "@openbts/drizzle";
import { count, desc, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({
        total_deleted: z.number(),
        by_source: z.array(
          z.object({
            source_type: z.string(),
            count: z.number(),
          }),
        ),
        by_import: z.array(
          z.object({
            import_id: z.number(),
            date: z.string(),
            deleted_count: z.number(),
          }),
        ),
      }),
    }),
  },
};

interface BySource {
  source_type: string;
  count: number;
}

interface ByImport {
  import_id: number;
  date: string;
  deleted_count: number;
}

interface Response {
  total_deleted: number;
  by_source: BySource[];
  by_import: ByImport[];
}

async function handler(_: FastifyRequest, res: ReplyPayload<JSONBody<Response>>) {
  try {
    const [totalResult, bySourceResult, byImportResult] = await Promise.all([
      db.select({ value: count() }).from(deletedEntries),
      db
        .select({
          source_type: deletedEntries.source_type,
          count: count(),
        })
        .from(deletedEntries)
        .groupBy(deletedEntries.source_type),
      db
        .select({
          import_id: deletedEntries.import_id,
          date: sql<string>`${ukeImportMetadata.last_import_date}::date::text`,
          deleted_count: count(),
        })
        .from(deletedEntries)
        .innerJoin(ukeImportMetadata, eq(deletedEntries.import_id, ukeImportMetadata.id))
        .groupBy(deletedEntries.import_id, ukeImportMetadata.last_import_date)
        .orderBy(desc(ukeImportMetadata.last_import_date))
        .limit(50),
    ]);

    return res.send({
      data: {
        total_deleted: totalResult[0]?.value ?? 0,
        by_source: bySourceResult.map((r) => ({
          source_type: r.source_type,
          count: r.count,
        })),
        by_import: byImportResult
          .filter((r): r is typeof r & { import_id: number } => r.import_id !== null)
          .map((r) => ({
            import_id: r.import_id,
            date: r.date,
            deleted_count: r.deleted_count,
          })),
      },
    });
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", {
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error,
    });
  }
}

const getDeletedEntriesSummary: Route<never, Response> = {
  url: "/deleted-entries/summary",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read:deleted_entries"], allowGuestAccess: true },
  handler,
};

export default getDeletedEntriesSummary;

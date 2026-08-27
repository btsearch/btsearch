import {
  locations,
  proposedCells,
  proposedGSMCells,
  proposedLTECells,
  proposedLocations,
  proposedNRCells,
  proposedStations,
  proposedUMTSCells,
  stations,
  submissions,
  users,
} from "@openbts/drizzle";
import { type SQL, and, count, eq, inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../services/settings.service.js";

const submissionsSchema = createSelectSchema(submissions);
const stationsSchema = createSelectSchema(stations);
const usersSchema = createSelectSchema(users).pick({ id: true, name: true, image: true, username: true });
const proposedCellsSchema = createSelectSchema(proposedCells);
const proposedStationSchema = createSelectSchema(proposedStations);
const gsmSchema = createSelectSchema(proposedGSMCells).omit({ proposed_cell_id: true });
const umtsSchema = createSelectSchema(proposedUMTSCells).omit({ proposed_cell_id: true });
const lteSchema = createSelectSchema(proposedLTECells).omit({ proposed_cell_id: true });
const nrSchema = createSelectSchema(proposedNRCells).omit({ proposed_cell_id: true });
const proposedDetailsSchema = z.union([gsmSchema, umtsSchema, lteSchema, nrSchema]).nullable();
const proposedCellWithDetails = proposedCellsSchema.extend({ details: proposedDetailsSchema });

const schemaRoute = {
  querystring: z.object({
    limit: z.coerce.number().min(1).max(100).default(10),
    offset: z.coerce.number().min(0).default(0),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    type: z.enum(["new", "update", "delete"]).optional(),
    submitter_ids: z.string().optional(),
    operators: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .optional()
      .transform((val): number[] | undefined =>
        val
          ? val
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          : undefined,
      ),
    regions: z
      .string()
      .regex(/^[A-Z]{3}(,[A-Z]{3})*$/)
      .optional()
      .transform((val): string[] | undefined => (val ? val.split(",").filter(Boolean) : undefined)),
    search: z.string().optional(),
    sort: z.enum(["asc", "desc"]).default("asc"),
  }),
  response: {
    200: z.object({
      data: z.array(
        submissionsSchema.extend({
          station: stationsSchema.nullable(),
          submitter: usersSchema,
          reviewer: usersSchema.nullable(),
          cells: z.array(proposedCellWithDetails),
          proposedStation: proposedStationSchema.nullable(),
        }),
      ),
      totalCount: z.number(),
    }),
  },
};

type Submission = z.infer<typeof submissionsSchema> & {
  station: z.infer<typeof stationsSchema> | null;
  submitter: z.infer<typeof usersSchema>;
  reviewer: z.infer<typeof usersSchema> | null;
  cells: z.infer<typeof proposedCellWithDetails>[];
  proposedStation: z.infer<typeof proposedStationSchema> | null;
};

type ReqQuery = { Querystring: z.infer<typeof schemaRoute.querystring> };
type ResponseData = z.infer<typeof submissionsSchema> & {
  station: z.infer<typeof stationsSchema> | null;
  submitter: z.infer<typeof usersSchema>;
  reviewer: z.infer<typeof usersSchema> | null;
  cells: z.infer<typeof proposedCellWithDetails>[];
  proposedStation: z.infer<typeof proposedStationSchema> | null;
};
type ResponseBody = { data: ResponseData[]; totalCount: number };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ResponseBody>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");
  const { limit, offset, status, type, submitter_ids, operators: operatorMncs, regions: regionCodes, search, sort } = req.query;

  const session = req.userSession;
  const apiToken = req.apiToken;
  if (!session?.user && !apiToken) throw new ErrorResponse("UNAUTHORIZED");

  const userId = session?.user?.id;
  if (!userId) throw new ErrorResponse("UNAUTHORIZED");

  const [operatorRows, regionRows] = await Promise.all([
    operatorMncs?.length
      ? db.query.operators.findMany({
          columns: { id: true },
          where: {
            mnc: { in: operatorMncs },
          },
        })
      : [],
    regionCodes?.length
      ? db.query.regions.findMany({
          columns: { id: true },
          where: {
            code: { in: regionCodes },
          },
        })
      : [],
  ]);
  const operatorIds = operatorRows.map((operator) => operator.id);
  const regionIds = regionRows.map((region) => region.id);

  if (operatorMncs?.length && operatorIds.length === 0) return res.send({ data: [], totalCount: 0 });
  if (regionCodes?.length && regionIds.length === 0) return res.send({ data: [], totalCount: 0 });

  const sqlIntArray = (ids: number[]) =>
    sql`ARRAY[${sql.join(
      ids.map((id) => sql`${id}`),
      sql`,`,
    )}]::int4[]`;

  const buildConditions = (t: typeof submissions) => {
    const conds: SQL[] = [];
    if (submitter_ids) {
      const ids = submitter_ids.split(",").filter(Boolean);
      if (ids.length === 1) conds.push(eq(t.submitter_id, ids[0]!));
      else if (ids.length > 1) conds.push(inArray(t.submitter_id, ids));
    }
    if (status) conds.push(eq(t.status, status));
    if (type) conds.push(eq(t.type, type));
    if (operatorIds.length) {
      const operatorArray = sqlIntArray(operatorIds);
      conds.push(sql`(
        EXISTS (
          SELECT 1 FROM ${stations}
          WHERE ${stations.id} = ${t.station_id}
          AND ${stations.operator_id} = ANY(${operatorArray})
        )
        OR EXISTS (
          SELECT 1 FROM ${proposedStations}
          WHERE ${proposedStations.submission_id} = ${t.id}
          AND ${proposedStations.operator_id} = ANY(${operatorArray})
        )
      )`);
    }
    if (regionIds.length) {
      const regionArray = sqlIntArray(regionIds);
      conds.push(sql`(
        EXISTS (
          SELECT 1 FROM ${stations}
          INNER JOIN ${locations} ON ${locations.id} = ${stations.location_id}
          WHERE ${stations.id} = ${t.station_id}
          AND ${locations.region_id} = ANY(${regionArray})
        )
        OR EXISTS (
          SELECT 1 FROM ${proposedLocations}
          WHERE ${proposedLocations.submission_id} = ${t.id}
          AND ${proposedLocations.region_id} = ANY(${regionArray})
        )
      )`);
    }
    if (search?.trim()) {
      const trimmed = search.trim();
      const like = `%${trimmed}%`;
      conds.push(sql`(
        ${t.id}::text ILIKE ${trimmed + "%"}
        OR EXISTS (
          SELECT 1 FROM ${stations}
          WHERE ${stations.id} = ${t.station_id}
          AND ${stations.station_id} ILIKE ${like}
        )
        OR EXISTS (
          SELECT 1 FROM ${proposedStations}
          WHERE ${proposedStations.submission_id} = ${t.id}
          AND ${proposedStations.station_id} ILIKE ${like}
        )
      )`);
    }
    return conds;
  };

  const countConds = buildConditions(submissions);
  const whereClause = countConds.length > 0 ? and(...countConds) : undefined;
  const [totalCount] = await db.select({ count: count() }).from(submissions).where(whereClause);

  const rows = await db.query.submissions.findMany({
    limit,
    offset,
    orderBy: sort === "asc" ? { createdAt: "asc" } : { createdAt: "desc" },
    where: { RAW: (fields) => and(...buildConditions(fields)) ?? sql`true` },
    with: {
      station: true,
      submitter: {
        columns: {
          id: true,
          name: true,
          image: true,
          username: true,
        },
      },
      reviewer: {
        columns: {
          id: true,
          name: true,
          image: true,
          username: true,
        },
      },
      proposedStation: true,
    },
  });

  const submissionIds = rows.map((s) => s.id).filter((n): n is string => n !== null && n !== undefined);
  const cellsBySubmission = new Map<string, z.infer<typeof proposedCellWithDetails>[]>();

  if (submissionIds.length > 0) {
    const rawCells = await db.query.proposedCells.findMany({
      where: { submission_id: { in: submissionIds } },
      with: {
        gsm: true,
        umts: true,
        lte: true,
        nr: true,
      },
    });

    for (const { gsm, umts, lte, nr, ...base } of rawCells) {
      const pc = { ...base, details: gsm ?? umts ?? lte ?? nr ?? null } as z.infer<typeof proposedCellWithDetails>;
      const key = base.submission_id as string;
      const arr = cellsBySubmission.get(key) ?? [];
      arr.push(pc);
      cellsBySubmission.set(key, arr);
    }
  }

  const data: Submission[] = rows.map((s) => ({
    ...s,
    cells: cellsBySubmission.get(s.id) ?? [],
  }));

  return res.send({ data, totalCount: totalCount?.count ?? 0 });
}

const getAdminSubmissions: Route<ReqQuery, ResponseBody> = {
  url: "/submissions/admin",
  method: "GET",
  schema: schemaRoute,
  config: {
    permissions: ["read:submissions"],
  },
  handler: handler,
};

export default getAdminSubmissions;

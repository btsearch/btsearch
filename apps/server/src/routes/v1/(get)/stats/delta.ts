import { cells, stations, submissions } from "@openbts/drizzle";
import { count, gte } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

interface Response {
  delta: {
    weekly: {
      stations: number;
      cells: number;
      submissions: number;
    };
  };
}

const schemaRoute = {
  response: {
    200: z.object({
      data: z.object({
        delta: z.object({
          weekly: z.object({
            stations: z.number(),
            cells: z.number(),
            submissions: z.number(),
          }),
        }),
      }),
    }),
  },
};

async function handler(_: FastifyRequest, res: ReplyPayload<JSONBody<Response>>) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [stationsWeekly, cellsWeekly, submissionsWeekly] = await Promise.all([
    db.select({ value: count() }).from(stations).where(gte(stations.createdAt, since)),
    db.select({ value: count() }).from(cells).where(gte(cells.createdAt, since)),
    db.select({ value: count() }).from(submissions).where(gte(submissions.createdAt, since)),
  ]);

  return res.send({
    data: {
      delta: {
        weekly: {
          stations: stationsWeekly[0]?.value ?? 0,
          cells: cellsWeekly[0]?.value ?? 0,
          submissions: submissionsWeekly[0]?.value ?? 0,
        },
      },
    },
  });
}

const getStatsDelta: Route<never, Response> = {
  url: "/stats/delta",
  method: "GET",
  schema: schemaRoute,
  config: { permissions: ["read_all:submissions"] },
  handler,
};

export default getStatsDelta;

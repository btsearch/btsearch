import { locations, proposedLocations, proposedStations, stations, submissions } from "@openbts/drizzle";
import { submissionListQuerySchema, submissionListSchema } from "@openbts/shared/contract";
import type { Paging, SubmissionList, SubmissionListQuery } from "@openbts/shared/contract";
import { and, asc, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { accessFromRequest } from "../../../../features/access/access.js";
import { proposedLocationInArea, stationInArea, unplacedProposedStationInArea } from "../../../../features/access/filters.js";
import { containsPattern, escapeLike } from "../../../../features/search/text.js";
import { canReadAllSubmissions } from "../../../../features/submissions/read.js";
import { DATABASE_SUBMISSION_STATUSES, serializeSubmissions } from "../../../../features/submissions/serialize.js";
import { SUBMISSION_TYPES } from "../../../../features/submissions/translate.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { encodeCursor, resolveOffset } from "../../../../lib/cursor.js";
import { getRuntimeSettings } from "../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "List submissions",
  description:
    "Returns your own submissions by default. Set `submitters=all` to list everyone's, which only editors and administrators can do. " +
    "An editor only gets submissions whose station or proposed location is in a country or region their grant covers. " +
    "A new station proposed without a location counts for editors whose grant covers the operator's whole country. " +
    "`submitterIds` only works together with `submitters=all`. " +
    "`q` matches the start of a submission id or any part of the station's site id. " +
    "`include=station` adds the station a submission changes, and `include=station.location` adds it together with the location it is at now. " +
    "`station` is `null` if the submission has no station yet or the station is in a country you cannot access.",
  querystring: submissionListQuerySchema,
  response: {
    200: submissionListSchema,
  },
};
const errorReasons = {
  400: "The request is invalid, or `submitterIds` was sent without `submitters=all`.",
  403: "Submissions are disabled, or you asked for `submitters=all` without being an editor or an administrator.",
};
type ReqQuery = { Querystring: SubmissionListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<SubmissionList>>) {
  res.header("Cache-Control", "private, no-store");
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const { submitters, submitterIds, statuses, actions, countryCodes, operatorIds, regionIds, q, createdAfter, sort, include, limit, includeTotal } =
    req.query;
  const offset = resolveOffset(req.query);

  const access = await accessFromRequest(req);
  if (access === null) throw new ErrorResponse("UNAUTHORIZED");

  const seesAll = submitters === "all";
  if (seesAll && !(await canReadAllSubmissions(req))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  if (!seesAll && submitterIds) throw new ErrorResponse("INVALID_QUERY", { message: "submitterIds needs submitters=all" });

  const like = containsPattern(q ?? "");
  const filters = and(
    seesAll ? undefined : eq(submissions.submitter_id, access.userId),
    seesAll && access.role !== "admin"
      ? or(
          stationInArea(access.grants, submissions.station_id),
          proposedLocationInArea(access.grants, submissions.id),
          and(eq(submissions.type, "new"), unplacedProposedStationInArea(access.grants, submissions.id)),
        )
      : undefined,
    submitterIds ? inArray(submissions.submitter_id, submitterIds) : undefined,
    countryCodes ? inArray(submissions.country_code, countryCodes) : undefined,
    createdAfter ? gte(submissions.createdAt, new Date(createdAfter)) : undefined,
    statuses
      ? inArray(
          submissions.status,
          statuses.map((status) => DATABASE_SUBMISSION_STATUSES[status]),
        )
      : undefined,
    actions
      ? inArray(
          submissions.type,
          actions.map((action) => SUBMISSION_TYPES[action]),
        )
      : undefined,
    operatorIds
      ? or(
          sql`EXISTS (
            SELECT 1 FROM ${stations}
            WHERE ${stations.id} = ${submissions.station_id} AND ${inArray(stations.operator_id, operatorIds)}
          )`,
          sql`EXISTS (
            SELECT 1 FROM ${proposedStations}
            WHERE ${proposedStations.submission_id} = ${submissions.id} AND ${inArray(proposedStations.operator_id, operatorIds)}
          )`,
        )
      : undefined,
    regionIds
      ? or(
          sql`EXISTS (
            SELECT 1 FROM ${stations}
            INNER JOIN ${locations} ON ${locations.id} = ${stations.location_id}
            WHERE ${stations.id} = ${submissions.station_id} AND ${inArray(locations.region_id, regionIds)}
          )`,
          sql`EXISTS (
            SELECT 1 FROM ${proposedLocations}
            WHERE ${proposedLocations.submission_id} = ${submissions.id} AND ${inArray(proposedLocations.region_id, regionIds)}
          )`,
        )
      : undefined,
    q
      ? or(
          sql`${submissions.id}::text ILIKE ${`${escapeLike(q)}%`}`,
          sql`EXISTS (SELECT 1 FROM ${stations} WHERE ${stations.id} = ${submissions.station_id} AND ${ilike(stations.station_id, like)})`,
          sql`EXISTS (
            SELECT 1 FROM ${proposedStations}
            WHERE ${proposedStations.submission_id} = ${submissions.id} AND ${ilike(proposedStations.station_id, like)}
          )`,
        )
      : undefined,
  );
  const direction = sort === "createdAt" ? asc : desc;

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(submissions)
      .where(filters)
      .orderBy(direction(submissions.createdAt), direction(submissions.id))
      .limit(limit + 1)
      .offset(offset),
    includeTotal ? db.select({ total: count() }).from(submissions).where(filters) : null,
  ]);
  const page = rows.slice(0, limit);
  const paging: Paging = { limit, nextCursor: rows.length > limit ? encodeCursor({ offset: offset + limit }) : null };
  if (totals) paging.total = totals[0]?.total ?? 0;

  return res.send({ data: await serializeSubmissions(req, page, include), paging });
}

const getSubmissions: Route<ReqQuery, SubmissionList> = {
  url: "/submissions",
  method: "GET",
  config: { permissions: ["read:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getSubmissions;

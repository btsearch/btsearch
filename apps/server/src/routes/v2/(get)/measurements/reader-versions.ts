import { measurementReaderVersionListSchema } from "@openbts/shared/contract";
import type { MeasurementReaderVersion } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { listReaderVersions } from "../../../../features/measurements/readers/versions.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List the reader versions",
  description: "Every version of every reader an upload has named. To block one, add a reading block on its `readerVersionId` without `fields`.",
  tags: ["measurement-administration"],
  querystring: z.object({}).strict(),
  response: { 200: measurementReaderVersionListSchema },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementReaderVersion[]>>) {
  return res.send({ data: await listReaderVersions() });
}

const getMeasurementReaderVersions: Route<RouteGenericInterface, MeasurementReaderVersion[]> = {
  url: "/measurements/reader-versions",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementReaderVersions;

import { measurementReadingBlockListSchema } from "@openbts/shared/contract";
import type { MeasurementReadingBlock } from "@openbts/shared/contract";
import type { RouteGenericInterface } from "fastify";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { listReadingBlocks } from "../../../../features/measurements/readers/readingBlocks.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List the reading blocks",
  description: "Switched-off blocks are listed too.",
  tags: ["measurement-administration"],
  querystring: z.object({}).strict(),
  response: { 200: measurementReadingBlockListSchema },
};

async function handler(_req: FastifyRequest, res: ReplyPayload<JSONBody<MeasurementReadingBlock[]>>) {
  return res.send({ data: await listReadingBlocks() });
}

const getMeasurementReadingBlocks: Route<RouteGenericInterface, MeasurementReadingBlock[]> = {
  url: "/measurements/reading-blocks",
  method: "GET",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default getMeasurementReadingBlocks;

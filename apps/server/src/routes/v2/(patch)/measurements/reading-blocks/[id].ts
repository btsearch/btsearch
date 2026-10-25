import { measurementReadingBlockParamsSchema, measurementReadingBlockSchema, measurementReadingBlockUpdateSchema } from "@openbts/shared/contract";
import type { MeasurementReadingBlock, MeasurementReadingBlockUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { updateReadingBlock } from "../../../../../features/measurements/readers/readingBlocks.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type RequestData = { Params: z.infer<typeof measurementReadingBlockParamsSchema>; Body: MeasurementReadingBlockUpdate };

const schemaRoute = {
  summary: "Change a reading block's reason, or switch it off or on",
  description: "The rest of a block never changes, so that withdrawals stay exact. To block other phones or values, add another block.",
  tags: ["measurement-administration"],
  params: measurementReadingBlockParamsSchema,
  body: measurementReadingBlockUpdateSchema,
  response: {
    200: z.object({
      data: measurementReadingBlockSchema,
    }),
  },
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MeasurementReadingBlock>>) {
  return res.send({ data: await updateReadingBlock(req, req.params.id, req.body) });
}

const updateMeasurementReadingBlock: Route<RequestData, MeasurementReadingBlock> = {
  url: "/measurements/reading-blocks/:id",
  method: "PATCH",
  config: { permissions: ["manage:observations"], callers: ["session"] },
  schema: schemaRoute,
  handler,
};

export default updateMeasurementReadingBlock;

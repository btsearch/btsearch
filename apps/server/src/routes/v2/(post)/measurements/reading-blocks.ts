import { measurementReadingBlockCreateSchema, measurementReadingBlockSchema } from "@openbts/shared/contract";
import type { MeasurementReadingBlock, MeasurementReadingBlockCreate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { createReadingBlock } from "../../../../features/measurements/readers/readingBlocks.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

type ReqBody = { Body: MeasurementReadingBlockCreate };

const schemaRoute = {
  summary: "Add a reading block",
  description:
    "A block drops or holds back the values some phones misreport, or drops their readings whole. Without `refold`, it acts only on uploads folded from now on.",
  tags: ["measurement-administration"],
  body: measurementReadingBlockCreateSchema,
  response: {
    201: z.object({
      data: measurementReadingBlockSchema,
    }),
  },
};
const errorReasons = { 400: "The SoC, device model or reader version in `phones` does not exist." };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<MeasurementReadingBlock>>) {
  return res.status(201).send({ data: await createReadingBlock(req, req.body) });
}

const createMeasurementReadingBlock: Route<ReqBody, MeasurementReadingBlock> = {
  url: "/measurements/reading-blocks",
  method: "POST",
  config: { permissions: ["manage:observations"], callers: ["session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default createMeasurementReadingBlock;

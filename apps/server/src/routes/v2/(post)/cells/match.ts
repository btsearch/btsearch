import { cellMatchAnswerSchema, cellMatchBodySchema, cellMatchQuerySchema } from "@openbts/shared/contract";
import type { CellMatchAnswer, CellMatchBody, CellMatchQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { matchCells } from "../../../../features/analyzer/match.js";
import { recordAnalyzerUsage } from "../../../../features/analyzer/usage.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Match cells from a phone log",
  description:
    "Compares cells seen by a phone with the database and tells you, for each one, whether the cell or at least its base station is known. " +
    "Nothing is changed. The request is only counted in the log analyzer usage statistics. " +
    "Cells are only matched against active stations, and networks or stations in countries you cannot access are reported as unknown. " +
    "You can send 30 requests per minute. Signed in as an editor you can send 120, and administrators are not limited. " +
    "With an API key the limit is always 30.",
  querystring: cellMatchQuerySchema,
  body: cellMatchBodySchema,
  response: {
    200: z.object({
      data: cellMatchAnswerSchema,
    }),
  },
};
const errorReasons = {
  429:
    "You can send up to 30 requests per minute, or 120 when you are signed in as an editor. " +
    "Also returned when the weekly quota of your API key is used up.",
  503: "The rate limit cannot be checked right now. Try again later.",
};
type RequestData = { Querystring: CellMatchQuery; Body: CellMatchBody };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<CellMatchAnswer>>) {
  void recordAnalyzerUsage();

  return res.send({ data: await matchCells(req, req.body.cells, req.query.include ?? []) });
}

const matchCellsRoute: Route<RequestData, CellMatchAnswer> = {
  url: "/cells/match",
  method: "POST",
  config: { permissions: ["read:cells", "read:stations"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default matchCellsRoute;

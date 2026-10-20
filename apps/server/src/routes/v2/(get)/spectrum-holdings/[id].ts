import { spectrumHoldingParamsSchema, spectrumHoldingQuerySchema, spectrumHoldingSchema } from "@openbts/shared/contract";
import type { SpectrumHolding, SpectrumHoldingQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { ErrorResponse } from "../../../../errors.js";
import { assertCountryVisible } from "../../../../features/countries/visibility.js";
import { serializeHolding } from "../../../../features/spectrumHoldings/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a spectrum holding",
  params: spectrumHoldingParamsSchema,
  querystring: spectrumHoldingQuerySchema,
  response: { 200: z.object({ data: spectrumHoldingSchema }) },
};
type ReqParams = { Params: z.infer<typeof spectrumHoldingParamsSchema> };
type ReqQuery = { Querystring: SpectrumHoldingQuery };
type RequestData = ReqParams & ReqQuery;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<SpectrumHolding>>) {
  const holding = await db.query.spectrumHoldings.findFirst({
    where: { id: req.params.id },
    with: { operator: { columns: { countryCode: true } } },
  });
  if (!holding) throw new ErrorResponse("NOT_FOUND");
  await assertCountryVisible(req, holding.operator.countryCode);

  return res.send({ data: await serializeHolding(holding, req.query.include) });
}

const getSpectrumHolding: Route<RequestData, SpectrumHolding> = {
  url: "/spectrum-holdings/:id",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getSpectrumHolding;

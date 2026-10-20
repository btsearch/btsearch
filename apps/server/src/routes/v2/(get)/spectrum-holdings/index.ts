import { operators, spectrumHoldings } from "@openbts/drizzle";
import { spectrumHoldingListQuerySchema, spectrumHoldingSchema } from "@openbts/shared/contract";
import type { SpectrumHolding, SpectrumHoldingListQuery } from "@openbts/shared/contract";
import { and, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { isActiveOn, serializeHoldings } from "../../../../features/spectrumHoldings/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List spectrum holdings",
  description: "Sorted by downlink frequency. Without `activeOn`, the list includes holdings whose licence has ended or has not started yet.",
  querystring: spectrumHoldingListQuerySchema,
  response: {
    200: z.object({
      data: z.array(spectrumHoldingSchema),
    }),
  },
};
type ReqQuery = { Querystring: SpectrumHoldingListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<SpectrumHolding[]>>) {
  const { operatorIds, bandIds, activeOn, include } = req.query;
  const countryCodes = await loadVisibleCountryCodes(req, req.query.countryCodes);
  if (countryCodes.length === 0) return res.send({ data: [] });

  const rows = await db
    .select()
    .from(spectrumHoldings)
    .where(
      and(
        inArray(spectrumHoldings.operatorId, db.select({ id: operators.id }).from(operators).where(inArray(operators.countryCode, countryCodes))),
        operatorIds === undefined ? undefined : inArray(spectrumHoldings.operatorId, operatorIds),
        bandIds === undefined ? undefined : inArray(spectrumHoldings.bandId, bandIds),
        activeOn === undefined ? undefined : isActiveOn(activeOn),
      ),
    )
    .orderBy(spectrumHoldings.downlinkLowKhz, spectrumHoldings.id);

  return res.send({ data: await serializeHoldings(rows, include) });
}

const getSpectrumHoldings: Route<ReqQuery, SpectrumHolding[]> = {
  url: "/spectrum-holdings",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getSpectrumHoldings;

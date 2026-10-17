import { emfFilingListQuerySchema, emfFilingListSchema } from "@openbts/shared/contract";
import type { EmfFilingList, EmfFilingListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertCapabilityVisible } from "../../../../features/countries/visibility.js";
import { listEmfFilings } from "../../../../features/emf/filings.js";
import { SI2PEM_UNAVAILABLE_REASON, answerFromSi2pem } from "../../../../features/emf/si2pem.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List EMF filings",
  description:
    "Returns the filings operators submitted for their installations. Each one says who filed it, when it was registered and published, " +
    "what its reference number is, and links to the installation document and the attached report. " +
    "SI2PEM is the only register connected so far. `capabilities.emf` in `GET /countries` tells you which countries the data covers. " +
    "Use this to browse filings across sites. For the reports of a single site, use `GET /emf/reports`. " +
    "Each combination of operator and region is a separate request to SI2PEM, so at most 16 combinations are allowed.",
  querystring: emfFilingListQuerySchema,
  response: {
    200: emfFilingListSchema,
  },
};
const errorReasons = {
  404: "You cannot access any of the countries this data covers.",
  503: SI2PEM_UNAVAILABLE_REASON,
};
type ReqQuery = { Querystring: EmfFilingListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<EmfFilingList>>) {
  await assertCapabilityVisible(req, "emf");

  return res.send(await answerFromSi2pem(res, () => listEmfFilings(req.query)));
}

const getEmfFilings: Route<ReqQuery, EmfFilingList> = {
  url: "/emf/filings",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getEmfFilings;

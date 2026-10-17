import { emfMeasurementListQuerySchema, emfMeasurementListSchema } from "@openbts/shared/contract";
import type { EmfMeasurementList, EmfMeasurementListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { assertCapabilityVisible } from "../../../../features/countries/visibility.js";
import { listEmfMeasurements } from "../../../../features/emf/measurements.js";
import { SI2PEM_UNAVAILABLE_REASON, answerFromSi2pem } from "../../../../features/emf/si2pem.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List EMF measurements",
  description:
    "Without `bbox`, each combination of status, operator and region is a separate request to SI2PEM, " +
    "so at most 16 combinations are allowed.\n\n" +
    "With `bbox`, rows have no `regionId`, there is one row per site, and measurements that ended more than 30 days ago are left out.",
  querystring: emfMeasurementListQuerySchema,
  response: {
    200: emfMeasurementListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid, or the area in `bbox` contains too many measurements and you should request a smaller one.",
  404: "You cannot access any of the countries this data covers.",
  503: SI2PEM_UNAVAILABLE_REASON,
};
type ReqQuery = { Querystring: EmfMeasurementListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<EmfMeasurementList>>) {
  await assertCapabilityVisible(req, "emf");

  return res.send(await answerFromSi2pem(res, () => listEmfMeasurements(req.query)));
}

const getEmfMeasurements: Route<ReqQuery, EmfMeasurementList> = {
  url: "/emf/measurements",
  method: "GET",
  config: { allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getEmfMeasurements;
